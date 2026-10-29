#include "evolu_codec.h"

#include "evolu_crypto.h"
#include "evolu_skiplist.h"

#include <stddef.h>
#include <stdlib.h>
#include <string.h>

// The failure's layout, which bindings read from memory, as the web's reads
// it from wasm, where the wasm types of its pointer can't pin it.
_Static_assert(sizeof(evolu_codec_failure_type) == 4,
               "evolu_codec_failure_type is 4 bytes");
_Static_assert(sizeof(evolu_codec_failure) == 8,
               "evolu_codec_failure is 8 bytes");
_Static_assert(offsetof(evolu_codec_failure, type) == 0,
               "evolu_codec_failure's type is at 0");
_Static_assert(offsetof(evolu_codec_failure, page_number) == 4,
               "evolu_codec_failure's page number is at 4");

static const uint8_t sqlite_header_string[16] = "SQLite format 3";

/* What starts every header of a rollback journal. */
static const uint8_t journal_magic[8] = {0xd9, 0xd5, 0x05, 0xf9,
                                         0x20, 0xa1, 0x63, 0xd7};

/* SQLCipher 4's default page size, which expo-sqlite kept. */
#define SQLCIPHER_PAGE_SIZE 4096

/* Every file type flag xOpen can get. */
#define FILE_TYPES                                                             \
  (SQLITE_OPEN_MAIN_DB | SQLITE_OPEN_TEMP_DB | SQLITE_OPEN_TRANSIENT_DB |      \
   SQLITE_OPEN_MAIN_JOURNAL | SQLITE_OPEN_TEMP_JOURNAL |                       \
   SQLITE_OPEN_SUBJOURNAL | SQLITE_OPEN_SUPER_JOURNAL | SQLITE_OPEN_WAL)

typedef struct {
  sqlite3_vfs base;
  sqlite3_vfs *inner;
} CodecVfs;

/*
 * Tells which reads and writes of a rollback journal are a record's page: the
 * journal's page size at offset P + 4, right after 4 bytes at P, is the page
 * those bytes number, unless they were the checksum right after the previous
 * record's page.
 */
typedef struct {
  /*
   * The page size the journal's first header stores, which SQLite writes before
   * any record it writes, or 0 in a journal it only reads, whose records it
   * reads at that size, when any page size goes.
   */
  uint32_t page_size;
  /* Where the page whose number was just read or written starts, and the
   * number, 0 for none. */
  sqlite3_int64 page_at;
  uint32_t page_number;
  /* Where the checksum after the page just read or written starts. */
  sqlite3_int64 checksum_at;
  /*
   * The sums of the bytes SQLite's checksum samples of that page, encrypted as
   * stored and decrypted as SQLite has it. SQLite reads or writes a record's
   * checksum only right after it read or wrote the record's page whole, which
   * set them.
   */
  uint32_t stored_sum;
  uint32_t plain_sum;
} JournalRecords;

typedef struct CodecFile CodecFile;
struct CodecFile {
  sqlite3_file base;
  /* The inner VFS's file, which follows this struct. */
  sqlite3_file *inner;
  int type;
  /* A main database's codec, NULL when it's plaintext, and its open flags. */
  evolu_page_codec *codec;
  int flags;
  evolu_codec_failure failure;
  /*
   * A main database's buffer for a page it encrypts or a copy of page 1 it
   * decrypts, which its journal uses too. A decrypted copy is wiped after
   * use.
   */
  uint8_t *scratch;
  size_t scratch_size;
  /* A journal's database. */
  CodecFile *database;
  JournalRecords records;
  /*
   * Whether this hot journal is one the database's proven key may not have
   * written: neither the database's page 1 nor the journal's page-1 record
   * authenticated when it was opened, as when a database with another key
   * replaced the file. A record that fails to authenticate then keeps the
   * journal rather than ending it. Writing a new journal clears it.
   */
  int is_key_unproven;
};

#define CODEC_FILE_SIZE ((sizeof(CodecFile) + 7) & ~(size_t)7)

/*
 * The key and flags evolu_codec_open passes to the database file's xOpen, and
 * whether an xOpen took them. Each call points the thread's pending at its own
 * and restores the one before, so a call made while another opens, as by an
 * inner VFS's xOpen, leaves the other's alone.
 */
typedef struct {
  const uint8_t *key;
  int flags;
  int is_taken;
} PendingKey;

static _Thread_local PendingKey *pending;

static const sqlite3_io_methods codec_io_methods;

static uint32_t read_be32(const uint8_t *bytes) {
  return (uint32_t)bytes[0] << 24 | (uint32_t)bytes[1] << 16 |
         (uint32_t)bytes[2] << 8 | bytes[3];
}

static void write_be32(uint8_t *bytes, uint32_t value) {
  bytes[0] = (uint8_t)(value >> 24);
  bytes[1] = (uint8_t)(value >> 16);
  bytes[2] = (uint8_t)(value >> 8);
  bytes[3] = (uint8_t)value;
}

/*
 * The sum of the bytes of a page that SQLite's journal checksum samples, every
 * 200th from the end, so the checksum is the journal's initializer plus it.
 */
static uint32_t sampled_sum(const uint8_t *page, int size) {
  uint32_t sum = 0;
  for (int i = size - 200; i > 0; i -= 200) sum += page[i];
  return sum;
}

/* The page size page 1 stores in bytes 16 and 17, big-endian, 1 for 65536. */
static size_t stored_page_size(const uint8_t *page1) {
  size_t size = (size_t)page1[16] << 8 | page1[17];
  return size == 1 ? 65536 : size;
}

/*
 * The number of the page a database read or write of a whole page is, 0 for
 * one that isn't.
 */
static uint32_t to_page_number(sqlite3_int64 offset, int amount) {
  if (!evolu_page_is_size((size_t)amount) || offset < 0 || offset % amount != 0)
    return 0;
  sqlite3_int64 index = offset / amount;
  return index < 0xffffffff ? (uint32_t)index + 1 : 0;
}

static void record_failure(CodecFile *database, evolu_codec_failure_type type,
                           uint32_t page_number) {
  if (database->failure.type != EVOLU_CODEC_FAILURE_NONE) return;
  database->failure.type = type;
  database->failure.page_number = page_number;
}

/* The database's scratch buffer of at least size bytes, or NULL. */
static uint8_t *scratch_of(CodecFile *database, size_t size) {
  if (database->scratch_size >= size) return database->scratch;
  uint8_t *scratch = evolu_calloc(1, size);
  if (scratch == NULL) return NULL;
  free(database->scratch);
  database->scratch = scratch;
  database->scratch_size = size;
  return scratch;
}

/*
 * Reads as the inner file's xRead does, zero-filling past its end, and sets
 * *count to the number of bytes the file had there. Returns SQLITE_OK,
 * SQLITE_IOERR_SHORT_READ or the inner file's error.
 */
static int read_counted(sqlite3_file *file, void *buffer, int amount,
                        sqlite3_int64 offset, int *count) {
  *count = 0;
  int rc = file->pMethods->xRead(file, buffer, amount, offset);
  if (rc == SQLITE_OK) *count = amount;
  if (rc != SQLITE_IOERR_SHORT_READ) return rc;
  sqlite3_int64 size;
  int size_rc = file->pMethods->xFileSize(file, &size);
  if (size_rc != SQLITE_OK) return size_rc;
  // A short read ends at the end of the file, before amount bytes.
  if (size > offset) *count = (int)(size - offset);
  return rc;
}

/*
 * Returns the number of the record's page a journal's read or write is, or 0,
 * and sets *is_checksum when it's the checksum right after that page.
 */
static uint32_t track_journal_record(JournalRecords *records,
                                     sqlite3_int64 offset,
                                     const uint8_t *bytes, int amount,
                                     int *is_checksum) {
  uint32_t number = records->page_number;
  int is_page = number > 0 && offset == records->page_at &&
                (records->page_size != 0
                     ? (uint32_t)amount == records->page_size
                     : evolu_page_is_size((size_t)amount));
  *is_checksum = amount == 4 && offset == records->checksum_at;
  int is_number = amount == 4 && offset != records->checksum_at;
  records->page_at = is_number ? offset + 4 : -1;
  records->page_number = is_number ? read_be32(bytes) : 0;
  records->checksum_at = is_page ? offset + amount : -1;
  return is_page ? number : 0;
}

/*
 * Decrypts the database's page 1 into its scratch buffer and returns 1 when it
 * authenticates, which gives the codec its salt, setting *size to its page
 * size: at the page size page 1 stores, and for SQLCipher's files, whose page
 * size is encrypted, at SQLCipher's. Returns 0 when it doesn't, setting *size
 * to the page size page 1 stores, or 0 for none, or -1 with *rc set to an I/O
 * or memory error.
 */
static int decrypt_page1(CodecFile *database, size_t *size, int *rc) {
  uint8_t header[18];
  int count;
  *size = 0;
  *rc = read_counted(database->inner, header, sizeof header, 0, &count);
  if (*rc != SQLITE_OK && *rc != SQLITE_IOERR_SHORT_READ) return -1;
  *rc = SQLITE_OK;
  if (count != (int)sizeof header) return 0;
  size_t stored = stored_page_size(header);
  size_t sizes[2];
  size_t size_count = 0;
  if (evolu_page_is_size(stored)) sizes[size_count++] = stored;
  if ((database->flags & EVOLU_CODEC_SQLCIPHER_FILES) &&
      stored != SQLCIPHER_PAGE_SIZE)
    sizes[size_count++] = SQLCIPHER_PAGE_SIZE;
  for (size_t i = 0; i < size_count; i++) {
    uint8_t *page = scratch_of(database, sizes[i]);
    if (page == NULL) {
      *rc = SQLITE_IOERR_NOMEM;
      return -1;
    }
    *rc = read_counted(database->inner, page, (int)sizes[i], 0, &count);
    if (*rc != SQLITE_OK && *rc != SQLITE_IOERR_SHORT_READ) return -1;
    *rc = SQLITE_OK;
    if (count == (int)sizes[i] &&
        evolu_page_decrypt(database->codec, 1, page, sizes[i])) {
      *size = sizes[i];
      return 1;
    }
  }
  if (evolu_page_is_size(stored)) *size = stored;
  return 0;
}

static int read_database_page(CodecFile *file, uint8_t *buffer, int amount,
                              sqlite3_int64 offset, uint32_t page_number) {
  int count;
  int rc = read_counted(file->inner, buffer, amount, offset, &count);
  if (rc != SQLITE_OK && rc != SQLITE_IOERR_SHORT_READ) return rc;
  // No ciphertext reaches SQLite as data. A read that gets nothing is past
  // the end, as page 1 of an empty file is. SQLite reads a page only within
  // the file, so one that ends early was cut off or torn and fails as a page
  // that doesn't authenticate, or zeros would pass as its data.
  if (count == 0) {
    memset(buffer, 0, (size_t)amount);
    return SQLITE_IOERR_SHORT_READ;
  }
  if (count == amount &&
      evolu_page_decrypt(file->codec, page_number, buffer, (size_t)amount))
    return SQLITE_OK;
  memset(buffer, 0, (size_t)amount);
  if (page_number == 1) {
    // A connection that opened the file while it was empty keeps SQLite's
    // default page size, so it reads page 1 whole at that size, and it reads
    // SQLCipher's page 1 at the size its encrypted bytes 16 and 17 make up.
    // Page 1 then decrypts at its own size, and the read gets its first
    // bytes, with zeros past them, so SQLite learns the size and reads it
    // again.
    size_t page_size;
    int page_rc;
    int decrypted = decrypt_page1(file, &page_size, &page_rc);
    if (decrypted < 0) return page_rc;
    if (decrypted) {
      memcpy(buffer, file->scratch,
             page_size < (size_t)amount ? page_size : (size_t)amount);
      evolu_wipe(file->scratch, page_size);
      return rc;
    }
  }
  record_failure(file, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION, page_number);
  return page_number == 1 ? SQLITE_NOTADB : SQLITE_CORRUPT;
}

/*
 * Part of page 1 within its first 100 bytes, where the two parts SQLite reads
 * lie: decrypted when it authenticates, as stored otherwise.
 */
static int read_part_of_page1(CodecFile *file, uint8_t *buffer, int amount,
                              sqlite3_int64 offset) {
  // Refused before anything is read or decrypted.
  if (offset < 0 || (sqlite3_uint64)offset + (sqlite3_uint64)amount > 100) {
    memset(buffer, 0, (size_t)amount);
    record_failure(file, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED, 0);
    return SQLITE_IOERR_READ;
  }
  int count;
  int rc = read_counted(file->inner, buffer, amount, offset, &count);
  if (rc != SQLITE_OK && rc != SQLITE_IOERR_SHORT_READ) return rc;
  size_t page_size;
  int page_rc;
  int decrypted = decrypt_page1(file, &page_size, &page_rc);
  if (decrypted < 0) return page_rc;
  if (decrypted) {
    memcpy(buffer, file->scratch + offset, (size_t)amount);
    evolu_wipe(file->scratch, page_size);
  }
  return rc;
}

/*
 * Whether the database's journal records store checksums over the page as
 * stored, encrypted, rather than as SQLite computes them over the plaintext.
 */
static int has_stored_checksums(const CodecFile *database) {
  return (database->flags & EVOLU_CODEC_PLAINTEXT_CHECKSUMS) == 0;
}

#ifdef EVOLU_TEST_HOOKS
void (*evolu_test_codec_journal_read)(const uint8_t *scratch, size_t size);
#endif

static int read_journal(CodecFile *file, uint8_t *buffer, int amount,
                        sqlite3_int64 offset) {
  CodecFile *database = file->database;
#ifdef EVOLU_TEST_HOOKS
  if (evolu_test_codec_journal_read != NULL)
    evolu_test_codec_journal_read(database->scratch, database->scratch_size);
#endif
  JournalRecords *records = &file->records;
  int count;
  int rc = read_counted(file->inner, buffer, amount, offset, &count);
  if (rc != SQLITE_OK && rc != SQLITE_IOERR_SHORT_READ) return rc;
  int is_checksum;
  uint32_t page_number =
      track_journal_record(records, offset, buffer, amount, &is_checksum);
  if (is_checksum) {
    // A stored checksum, the initializer plus the stored sum, becomes the
    // initializer plus the sum of the page SQLite read, decrypted, which is
    // what SQLite compares it with. That holds exactly when the stored one
    // matched the stored page, so a stale or torn record still fails. A short
    // read keeps the zeros past the end of the file, as xRead must.
    if (rc == SQLITE_OK && has_stored_checksums(database))
      write_be32(buffer, read_be32(buffer) - records->stored_sum +
                             records->plain_sum);
    return rc;
  }
  if (page_number == 0) return rc;
  // A short read ends a journal.
  if (count != amount) {
    memset(buffer, 0, (size_t)amount);
    return SQLITE_IOERR_SHORT_READ;
  }
  uint32_t stored_sum = sampled_sum(buffer, amount);
  // Only check_journal gives a journal's records their salt. A rollback reads
  // up to the end of a journal that hasn't counted its records, where a kept
  // one can hold another database's page-1 record, and it reads a record's
  // page before it skips one above the original size. So a page-1 record with
  // another salt fails, or its salt would replace the codec's, proving a key
  // that wrote no record of this journal's transaction or giving an emptied
  // database an earlier database's salt.
  int is_key_proven =
      evolu_page_is_key_proven(database->codec) && !file->is_key_unproven;
  int is_other_salt =
      page_number == 1 && !evolu_page_has_salt(database->codec, buffer);
  if (!is_other_salt && evolu_page_decrypt(database->codec, page_number,
                                           buffer, (size_t)amount)) {
    records->stored_sum = stored_sum;
    records->plain_sum = sampled_sum(buffer, amount);
    return SQLITE_OK;
  }
  memset(buffer, 0, (size_t)amount);
  // With the key proven, a record's page that fails to authenticate ends the
  // journal, as a checksum that differs ends it in SQLite, whose rollback
  // takes a short read as the end. A crash with synchronous = OFF can leave a
  // stale page after a new page number.
  if (is_key_proven) return SQLITE_IOERR_SHORT_READ;
  record_failure(database, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION,
                 page_number);
  return page_number == 1 ? SQLITE_NOTADB : SQLITE_CORRUPT;
}

static int codec_read(sqlite3_file *base, void *buffer, int amount,
                      sqlite3_int64 offset) {
  CodecFile *file = (CodecFile *)base;
  if (file->type == SQLITE_OPEN_MAIN_DB && file->codec != NULL) {
    uint32_t page_number = to_page_number(offset, amount);
    return page_number != 0
               ? read_database_page(file, buffer, amount, offset, page_number)
               : read_part_of_page1(file, buffer, amount, offset);
  }
  if (file->type == SQLITE_OPEN_MAIN_JOURNAL && file->database->codec != NULL)
    return read_journal(file, buffer, amount, offset);
  return file->inner->pMethods->xRead(file->inner, buffer, amount, offset);
}

/*
 * Encrypts a page of the database and writes it to file, setting *stored_sum,
 * when given, to the sampled sum of what it stored.
 */
static int write_page(CodecFile *file, CodecFile *database,
                      uint32_t page_number, const void *page, int amount,
                      sqlite3_int64 offset, uint32_t *stored_sum) {
  uint8_t *output = scratch_of(database, (size_t)amount);
  if (output == NULL) return SQLITE_IOERR_NOMEM;
  evolu_page_result result = evolu_page_encrypt(
      database->codec, page_number, page, (size_t)amount, output);
  if (result == EVOLU_PAGE_OK) {
    if (stored_sum != NULL) *stored_sum = sampled_sum(output, amount);
    return file->inner->pMethods->xWrite(file->inner, output, amount, offset);
  }
  record_failure(database,
                 result == EVOLU_PAGE_RANDOM_FAILED
                     ? EVOLU_CODEC_FAILURE_RANDOM
                     : EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED,
                 0);
  return SQLITE_IOERR_WRITE;
}

static int codec_write(sqlite3_file *base, const void *buffer, int amount,
                       sqlite3_int64 offset) {
  CodecFile *file = (CodecFile *)base;
  // Bytes 18 and 19 of page 1, the file format versions, are 2 for WAL, as
  // PRAGMA journal_mode = WAL under locking_mode = EXCLUSIVE writes them and a
  // backup from a WAL database copies them. The codec opens no WAL file, so a
  // database whose page 1 said WAL, keyed or not, would never open again.
  if (file->type == SQLITE_OPEN_MAIN_DB && offset == 0 && amount > 19 &&
      (((const uint8_t *)buffer)[18] != 1 ||
       ((const uint8_t *)buffer)[19] != 1)) {
    record_failure(file, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED, 0);
    return SQLITE_IOERR_WRITE;
  }
  if (file->type == SQLITE_OPEN_MAIN_DB && file->codec != NULL) {
    uint32_t page_number = to_page_number(offset, amount);
    if (page_number == 0) {
      record_failure(file, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED, 0);
      return SQLITE_IOERR_WRITE;
    }
    return write_page(file, file, page_number, buffer, amount, offset, NULL);
  }
  if (file->type == SQLITE_OPEN_MAIN_JOURNAL &&
      file->database->codec != NULL) {
    JournalRecords *records = &file->records;
    // writeJournalHdr writes the first header whole, of a journal whose
    // records this connection writes.
    if (offset == 0 && amount >= 28 &&
        evolu_page_is_size(read_be32((const uint8_t *)buffer + 24))) {
      records->page_size = read_be32((const uint8_t *)buffer + 24);
      file->is_key_unproven = 0;
    }
    int is_checksum;
    uint32_t page_number =
        track_journal_record(records, offset, buffer, amount, &is_checksum);
    if (page_number != 0) {
      records->plain_sum = sampled_sum(buffer, amount);
      return write_page(file, file->database, page_number, buffer, amount,
                        offset, &records->stored_sum);
    }
    // A journal's headers and page numbers are stored as they are, and a
    // record's checksum covers its page as stored, as SQLCipher computes it:
    // SQLite's initializer, SQLite's checksum less its sum, plus the stored
    // sum.
    if (is_checksum && has_stored_checksums(file->database)) {
      uint8_t checksum[4];
      write_be32(checksum, read_be32(buffer) - records->plain_sum +
                               records->stored_sum);
      return file->inner->pMethods->xWrite(file->inner, checksum, 4, offset);
    }
  }
  return file->inner->pMethods->xWrite(file->inner, buffer, amount, offset);
}

static int codec_close(sqlite3_file *base) {
  CodecFile *file = (CodecFile *)base;
  if (file->type == SQLITE_OPEN_MAIN_DB) {
    evolu_page_codec_destroy(file->codec);
    if (file->scratch != NULL) evolu_wipe(file->scratch, file->scratch_size);
    free(file->scratch);
  }
  return file->inner->pMethods->xClose(file->inner);
}

static int codec_truncate(sqlite3_file *base, sqlite3_int64 size) {
  sqlite3_file *inner = ((CodecFile *)base)->inner;
  return inner->pMethods->xTruncate(inner, size);
}

static int codec_sync(sqlite3_file *base, int flags) {
  sqlite3_file *inner = ((CodecFile *)base)->inner;
  return inner->pMethods->xSync(inner, flags);
}

static int codec_file_size(sqlite3_file *base, sqlite3_int64 *size) {
  sqlite3_file *inner = ((CodecFile *)base)->inner;
  return inner->pMethods->xFileSize(inner, size);
}

static int codec_lock(sqlite3_file *base, int level) {
  sqlite3_file *inner = ((CodecFile *)base)->inner;
  return inner->pMethods->xLock(inner, level);
}

static int codec_unlock(sqlite3_file *base, int level) {
  sqlite3_file *inner = ((CodecFile *)base)->inner;
  return inner->pMethods->xUnlock(inner, level);
}

static int codec_check_reserved_lock(sqlite3_file *base, int *result) {
  sqlite3_file *inner = ((CodecFile *)base)->inner;
  return inner->pMethods->xCheckReservedLock(inner, result);
}

/*
 * Whether a pragma keys or rekeys a database, or configures a cipher, as
 * SQLCipher and SQLite3 Multiple Ciphers do, which plain SQLite ignores.
 */
static int is_keying_pragma(const char *name) {
  static const char *const names[] = {"key",   "hexkey",   "textkey",
                                      "rekey", "hexrekey", "textrekey"};
  for (size_t i = 0; i < sizeof names / sizeof names[0]; i++)
    if (sqlite3_stricmp(name, names[i]) == 0) return 1;
  return sqlite3_strnicmp(name, "cipher", 6) == 0;
}

/* Whether a value of PRAGMA secure_delete turns it on, as SQLite reads it. */
static int is_secure_delete_on(const char *value) {
  return sqlite3_stricmp(value, "on") == 0 ||
         sqlite3_stricmp(value, "yes") == 0 ||
         sqlite3_stricmp(value, "true") == 0 || strcmp(value, "1") == 0;
}

static int codec_file_control(sqlite3_file *base, int op, void *arg) {
  CodecFile *file = (CodecFile *)base;
  // The slot for the pragma's result or error message, its name, and its
  // value, NULL for a query.
  char **pragma = arg;
  // SQLite would ignore them, so a database keyed through SQL would be stored
  // in plaintext, with the key in the SQL. SQLite sends a pragma only to a
  // database's file.
  if (op == SQLITE_FCNTL_PRAGMA && is_keying_pragma(pragma[1])) {
    pragma[0] = sqlite3_mprintf("Databases are keyed only through "
                                "evolu_codec_open, never through SQL.");
    if (pragma[0] == NULL) return SQLITE_NOMEM;
    record_failure(file, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED, 0);
    return SQLITE_ERROR;
  }
  if (op == SQLITE_FCNTL_PRAGMA && file->codec != NULL) {
    if (sqlite3_stricmp(pragma[1], "secure_delete") == 0 && pragma[2] != NULL &&
        !is_secure_delete_on(pragma[2])) {
      // SQLite frees the message.
      pragma[0] = sqlite3_mprintf(
          "Cannot turn secure_delete off for an encrypted database, because a "
          "freed page it doesn't write would fail to authenticate.");
      if (pragma[0] == NULL) return SQLITE_NOMEM;
      record_failure(file, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED, 0);
      return SQLITE_ERROR;
    }
  }
  return file->inner->pMethods->xFileControl(file->inner, op, arg);
}

static int codec_sector_size(sqlite3_file *base) {
  sqlite3_file *inner = ((CodecFile *)base)->inner;
  // Optional, and SQLite reads a missing one as its default sector size.
  return inner->pMethods->xSectorSize != NULL
             ? inner->pMethods->xSectorSize(inner)
             : 4096;
}

static int codec_device_characteristics(sqlite3_file *base) {
  sqlite3_file *inner = ((CodecFile *)base)->inner;
  return inner->pMethods->xDeviceCharacteristics(inner) &
         SQLITE_IOCAP_POWERSAFE_OVERWRITE;
}

static const sqlite3_io_methods codec_io_methods = {
    1,
    codec_close,
    codec_read,
    codec_write,
    codec_truncate,
    codec_sync,
    codec_file_size,
    codec_lock,
    codec_unlock,
    codec_check_reserved_lock,
    codec_file_control,
    codec_sector_size,
    codec_device_characteristics,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
};

/*
 * A walk over a hot rollback journal's records in the order SQLite's rollback
 * reads them (pager_playback, pager_playback_one_page), up to where it stops.
 * The first header gives the sector and page sizes and the database's size in
 * pages before the transaction. Each segment starts with a header at a
 * multiple of the sector size, with SQLite's magic, the number of records that
 * follow it, 0 for none and 0xFFFFFFFF for the records up to the end of the
 * file, which synchronous = OFF writes, and the initializer of their
 * checksums.
 */
typedef struct {
  sqlite3_file *journal;
  sqlite3_int64 size;
  uint32_t sector_size;
  uint32_t page_size;
  uint32_t original_size;
  /* The page that holds SQLite's lock byte, which it never journals. */
  uint32_t lock_page;
  uint32_t checksum_init;
  uint32_t records_left;
  /* Where the next record, or the header before it, starts. */
  sqlite3_int64 at;
} JournalWalk;

typedef struct {
  uint32_t page_number;
  /*
   * Whether SQLite compares the record's checksum, which it does for a page
   * within the original size; it skips any other page.
   */
  int has_checksum;
  uint32_t checksum;
  /* Where the record starts. */
  sqlite3_int64 at;
} JournalRecord;

/*
 * Starts a walk over a journal of size bytes. Returns SQLITE_OK, SQLITE_DONE
 * for a journal whose first header SQLite wouldn't read, or an I/O error.
 */
static int start_journal_walk(JournalWalk *walk, sqlite3_file *journal,
                              sqlite3_int64 size) {
  uint8_t header[28];
  int count;
  int rc = read_counted(journal, header, sizeof header, 0, &count);
  if (rc != SQLITE_OK && rc != SQLITE_IOERR_SHORT_READ) return rc;
  walk->journal = journal;
  walk->size = size;
  walk->sector_size = read_be32(header + 20);
  walk->page_size = read_be32(header + 24);
  walk->original_size = read_be32(header + 16);
  walk->records_left = 0;
  walk->at = 0;
  if (count != (int)sizeof header || walk->sector_size < 32 ||
      walk->sector_size > 65536 ||
      (walk->sector_size & (walk->sector_size - 1)) != 0 ||
      !evolu_page_is_size(walk->page_size))
    return SQLITE_DONE;
  walk->lock_page = 0x40000000u / walk->page_size + 1;
  return SQLITE_OK;
}

/*
 * Reads the walk's next record into record and its page into page, which
 * holds the walk's page size. Returns SQLITE_OK, SQLITE_DONE where the
 * rollback stops, or an I/O error. The rollback stops at a header that the
 * file doesn't hold whole or whose magic differs, at a record numbered 0 or
 * with the lock-byte page, and at a record the file doesn't hold whole, which
 * it reads short. A segment whose count runs past the end of the file still
 * plays its whole records. The caller stops at a checksum that differs.
 */
static int next_journal_record(JournalWalk *walk, uint8_t *page,
                               JournalRecord *record) {
  sqlite3_int64 record_size = (sqlite3_int64)walk->page_size + 8;
  int count;
  int rc;
  while (walk->records_left == 0) {
    sqlite3_int64 at = (walk->at + walk->sector_size - 1) / walk->sector_size *
                       walk->sector_size;
    if (at + walk->sector_size > walk->size) return SQLITE_DONE;
    // Within the file, so whole. So are the record's reads below.
    uint8_t header[16];
    rc = read_counted(walk->journal, header, sizeof header, at, &count);
    if (rc != SQLITE_OK) return rc;
    if (memcmp(header, journal_magic, sizeof journal_magic) != 0)
      return SQLITE_DONE;
    walk->at = at + walk->sector_size;
    walk->checksum_init = read_be32(header + 12);
    uint32_t records = read_be32(header + 8);
    walk->records_left =
        records == 0xffffffff
            ? (uint32_t)((walk->size - walk->at) / record_size)
            : records;
    // A count of 0 plays no record, and the next header would follow.
    if (walk->records_left == 0 && records == 0) continue;
    if (walk->records_left == 0) return SQLITE_DONE;
  }
  if (walk->at + record_size > walk->size) return SQLITE_DONE;
  uint8_t bytes[4];
  rc = read_counted(walk->journal, bytes, sizeof bytes, walk->at, &count);
  if (rc != SQLITE_OK) return rc;
  record->page_number = read_be32(bytes);
  rc = read_counted(walk->journal, page, (int)walk->page_size, walk->at + 4,
                    &count);
  if (rc != SQLITE_OK) return rc;
  rc = read_counted(walk->journal, bytes, sizeof bytes,
                    walk->at + 4 + walk->page_size, &count);
  if (rc != SQLITE_OK) return rc;
  record->checksum = read_be32(bytes);
  record->has_checksum = record->page_number <= walk->original_size;
  record->at = walk->at;
  walk->at += record_size;
  walk->records_left--;
  if (record->page_number == 0 || record->page_number == walk->lock_page)
    return SQLITE_DONE;
  return SQLITE_OK;
}

/*
 * Sets *is_plaintext to whether the first page-1 record a hot journal's
 * rollback reaches is plaintext: it and every record before it match their
 * checksums as stored, and it starts with SQLite's header string. Returns an
 * I/O or memory error, or SQLITE_OK.
 */
static int find_plaintext_page1(sqlite3_file *journal, sqlite3_int64 size,
                                CodecFile *database, int *is_plaintext) {
  *is_plaintext = 0;
  JournalWalk walk;
  int rc = start_journal_walk(&walk, journal, size);
  if (rc != SQLITE_OK) return rc == SQLITE_DONE ? SQLITE_OK : rc;
  uint8_t *page = scratch_of(database, walk.page_size);
  if (page == NULL) return SQLITE_IOERR_NOMEM;
  JournalRecord record;
  while ((rc = next_journal_record(&walk, page, &record)) == SQLITE_OK) {
    if (record.has_checksum &&
        record.checksum !=
            walk.checksum_init + sampled_sum(page, (int)walk.page_size))
      break;
    if (record.page_number == 1) {
      *is_plaintext = memcmp(page, sqlite_header_string, 16) == 0;
      break;
    }
  }
  return rc == SQLITE_DONE ? SQLITE_OK : rc;
}

/*
 * Reads into the database's scratch buffer the page of the first page-1
 * record a hot journal's rollback reaches with that record's salt, setting
 * *record_page_size to its size, or to 0 when there's none. It and every
 * record before it must authenticate with the HMAC key of the record's salt,
 * a page above the original size too, because read_journal decrypts a
 * record's page before SQLite skips it, and match their checksums where SQLite
 * compares them: over the stored page with stored checksums, and over the
 * decrypted one with plaintext checksums, as read_journal has SQLite compare.
 * The check changes nothing in the codec. Returns an I/O or memory error, or
 * SQLITE_OK.
 */
static int read_reachable_page1(sqlite3_file *journal, sqlite3_int64 size,
                                CodecFile *database,
                                size_t *record_page_size) {
  *record_page_size = 0;
  JournalWalk walk;
  int rc = start_journal_walk(&walk, journal, size);
  if (rc != SQLITE_OK) return rc == SQLITE_DONE ? SQLITE_OK : rc;
  int page_size = (int)walk.page_size;
  uint8_t *page = scratch_of(database, walk.page_size);
  if (page == NULL) return SQLITE_IOERR_NOMEM;
  JournalRecord record;
  while ((rc = next_journal_record(&walk, page, &record)) == SQLITE_OK &&
         record.page_number != 1)
    ;
  if (rc != SQLITE_OK) return rc == SQLITE_DONE ? SQLITE_OK : rc;
  uint8_t salt[EVOLU_PAGE_SALT_SIZE];
  memcpy(salt, page, sizeof salt);
  sqlite3_int64 page1_at = record.at;
  int is_stored = has_stored_checksums(database);
  rc = start_journal_walk(&walk, journal, size);
  while (rc == SQLITE_OK &&
         (rc = next_journal_record(&walk, page, &record)) == SQLITE_OK) {
    uint32_t sum = sampled_sum(page, page_size);
    int is_authentic = evolu_page_decrypt_with_salt(
        database->codec, salt, record.page_number, page, walk.page_size);
    if (is_authentic && !is_stored) sum = sampled_sum(page, page_size);
    evolu_wipe(page, walk.page_size);
    if (!is_authentic ||
        (record.has_checksum && record.checksum != walk.checksum_init + sum))
      break;
    if (record.at == page1_at) {
      int count;
      rc = read_counted(journal, page, page_size, record.at + 4, &count);
      if (rc != SQLITE_OK) return rc;
      *record_page_size = walk.page_size;
      return SQLITE_OK;
    }
  }
  // The walk reads what the first one read, which reached page1_at, so it
  // ends before only at a record that fails, or at an I/O error.
  return rc;
}

/*
 * What opening a journal returns for a check that failed with rc: SQLITE_NOMEM
 * for a memory error, which a retry can pass, and SQLITE_CANTOPEN otherwise.
 */
static int journal_check_error(int rc) {
  return rc == SQLITE_IOERR_NOMEM ? SQLITE_NOMEM : SQLITE_CANTOPEN;
}

/*
 * The checks of opening an existing journal, before SQLite rolls it back:
 * the salt for its records' HMAC key, and the refusal of a hot journal of an
 * unkeyed database whose first bytes aren't SQLite's header string, unless its
 * page-1 record is plaintext. Returns SQLITE_OK, SQLITE_NOMEM or
 * SQLITE_CANTOPEN.
 */
static int check_journal(CodecFile *database, CodecFile *journal_file) {
  sqlite3_file *journal = journal_file->inner;
  sqlite3_int64 journal_size;
  if (journal->pMethods->xFileSize(journal, &journal_size) != SQLITE_OK)
    return SQLITE_CANTOPEN;
  // A journal this open creates holds nothing to roll back.
  if (journal_size == 0) return SQLITE_OK;
  uint8_t start[16];
  int count;
  int rc = read_counted(database->inner, start, sizeof start, 0, &count);
  if (rc != SQLITE_OK && rc != SQLITE_IOERR_SHORT_READ) return SQLITE_CANTOPEN;
  evolu_page_codec *codec = database->codec;
  // Without the key, the first bytes matter only when they aren't SQLite's
  // header string, as an encrypted database's salt isn't, which a torn write
  // can leave as zeros.
  if (count == 0 ||
      (codec == NULL && memcmp(start, sqlite_header_string, 16) == 0))
    return SQLITE_OK;
  // SQLite rolls back only a journal whose first byte isn't 0, as the magic
  // isn't, which it writes when it first syncs the journal, or with the header
  // when synchronous = OFF. The first header stores the database's original
  // size in pages at byte 16, 0 when it had none: such a journal journals no
  // page, and rolling it back only empties the database, whose first bytes
  // are then a hole a spill left before page 1 was written.
  uint8_t journal_start[20];
  rc = read_counted(journal, journal_start, sizeof journal_start, 0, &count);
  if (rc != SQLITE_OK && rc != SQLITE_IOERR_SHORT_READ) return SQLITE_CANTOPEN;
  if (journal_start[0] == 0 || read_be32(journal_start + 16) == 0)
    return SQLITE_OK;
  if (codec == NULL) {
    // A crash can tear a plaintext database's page 1 only after SQLite
    // journaled and synced it, so its journal holds a plaintext page-1 record,
    // which the rollback restores, while an encrypted journal's record starts
    // with the salt. A journal kept by journal_mode = PERSIST or locking_mode =
    // EXCLUSIVE can hold an earlier database's records past its own, which the
    // rollback never reaches.
    int is_plaintext;
    rc = find_plaintext_page1(journal, journal_size, database, &is_plaintext);
    if (rc != SQLITE_OK) return journal_check_error(rc);
    if (is_plaintext) return SQLITE_OK;
    record_failure(database, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED, 0);
    return SQLITE_CANTOPEN;
  }
  // The database's page 1 stores the salt, even when another connection
  // created the database again since a page 1 proved this codec's key. A
  // journal's page-1 record does too, for a page 1 a crash tore, but only one
  // the rollback reaches with that salt: a kept journal can hold an earlier
  // database's records past its own, whose page-1 record another key wrote,
  // and taking its salt would prove that key and end the rollback at the
  // first record of this journal's own transaction.
  size_t page_size;
  int decrypted = decrypt_page1(database, &page_size, &rc);
  if (decrypted < 0) return journal_check_error(rc);
  if (decrypted) {
    evolu_wipe(database->scratch, page_size);
    return SQLITE_OK;
  }
  size_t record_page_size;
  rc = read_reachable_page1(journal, journal_size, database, &record_page_size);
  if (rc != SQLITE_OK) return journal_check_error(rc);
  if (record_page_size != 0) {
    // It authenticated with its own salt in the walk, so it does again, which
    // gives the codec that salt and proves the key, unless the journal
    // changed since.
    int authenticated =
        evolu_page_decrypt(codec, 1, database->scratch, record_page_size);
    evolu_wipe(database->scratch, record_page_size);
    if (authenticated) return SQLITE_OK;
  }
  // A database keeps its salt while it has pages, so a tear must not replace
  // a proven one. Nothing here proved it for this journal, though, which
  // another key may have written.
  if (evolu_page_is_key_proven(codec)) journal_file->is_key_unproven = 1;
  else evolu_page_use_salt(codec, start);
  return SQLITE_OK;
}

static int codec_open(sqlite3_vfs *vfs, sqlite3_filename name,
                      sqlite3_file *base, int flags, int *out_flags) {
  sqlite3_vfs *inner_vfs = ((CodecVfs *)vfs)->inner;
  CodecFile *file = (CodecFile *)base;
  memset(file, 0, sizeof *file);
  int type = flags & FILE_TYPES;
  // The core keeps temporary files in memory, and a database on a codec VFS
  // never says WAL, so nothing else ever reaches a file.
  if (type != SQLITE_OPEN_MAIN_DB && type != SQLITE_OPEN_MAIN_JOURNAL &&
      type != SQLITE_OPEN_SUPER_JOURNAL)
    return SQLITE_CANTOPEN;
  CodecFile *database = NULL;
  if (type == SQLITE_OPEN_MAIN_JOURNAL) {
    sqlite3_file *database_file = sqlite3_database_file_object(name);
    if (database_file->pMethods != &codec_io_methods) return SQLITE_CANTOPEN;
    database = (CodecFile *)database_file;
  }
  file->inner = (sqlite3_file *)((char *)file + CODEC_FILE_SIZE);
  file->type = type;
  file->database = database;
  file->records.page_at = -1;
  file->records.checksum_at = -1;

  // Taken before the inner VFS opens the file, since its xOpen may open another
  // database through a codec VFS on this thread, which would take it.
  if (type == SQLITE_OPEN_MAIN_DB && pending != NULL && pending->key != NULL &&
      !pending->is_taken) {
    file->flags = pending->flags;
    file->codec = evolu_page_codec_create(
        pending->key, pending->flags & EVOLU_CODEC_SQLCIPHER_FILES
                          ? EVOLU_PAGE_ALLOW_SQLCIPHER_LAYOUT
                          : 0);
    if (file->codec == NULL) return SQLITE_NOMEM;
    pending->is_taken = 1;
  }
  int rc = inner_vfs->xOpen(inner_vfs, name, file->inner, flags, out_flags);
  if (rc == SQLITE_OK && type == SQLITE_OPEN_MAIN_JOURNAL)
    rc = check_journal(database, file);
  if (rc != SQLITE_OK) {
    evolu_page_codec_destroy(file->codec);
    if (file->inner->pMethods != NULL)
      file->inner->pMethods->xClose(file->inner);
    return rc;
  }
  file->base.pMethods = &codec_io_methods;
  return SQLITE_OK;
}

static int codec_delete(sqlite3_vfs *vfs, const char *name, int sync_dir) {
  sqlite3_vfs *inner = ((CodecVfs *)vfs)->inner;
  // Optional, and SQLite reads a missing one as a deletion that succeeded.
  return inner->xDelete != NULL ? inner->xDelete(inner, name, sync_dir)
                                : SQLITE_OK;
}

static int codec_access(sqlite3_vfs *vfs, const char *name, int flags,
                        int *result) {
  sqlite3_vfs *inner = ((CodecVfs *)vfs)->inner;
  return inner->xAccess(inner, name, flags, result);
}

static int codec_full_pathname(sqlite3_vfs *vfs, const char *name, int size,
                               char *output) {
  sqlite3_vfs *inner = ((CodecVfs *)vfs)->inner;
  return inner->xFullPathname(inner, name, size, output);
}

static int codec_randomness(sqlite3_vfs *vfs, int size, char *output) {
  sqlite3_vfs *inner = ((CodecVfs *)vfs)->inner;
  return inner->xRandomness(inner, size, output);
}

static int codec_sleep(sqlite3_vfs *vfs, int microseconds) {
  sqlite3_vfs *inner = ((CodecVfs *)vfs)->inner;
  return inner->xSleep(inner, microseconds);
}

static int codec_current_time(sqlite3_vfs *vfs, double *now) {
  sqlite3_vfs *inner = ((CodecVfs *)vfs)->inner;
  return inner->xCurrentTime(inner, now);
}

static int codec_get_last_error(sqlite3_vfs *vfs, int size, char *message) {
  sqlite3_vfs *inner = ((CodecVfs *)vfs)->inner;
  // Optional, and SQLite reads a missing one as no error number.
  return inner->xGetLastError != NULL
             ? inner->xGetLastError(inner, size, message)
             : 0;
}

static int codec_current_time_int64(sqlite3_vfs *vfs, sqlite3_int64 *now) {
  sqlite3_vfs *inner = ((CodecVfs *)vfs)->inner;
  if (inner->iVersion >= 2 && inner->xCurrentTimeInt64 != NULL)
    return inner->xCurrentTimeInt64(inner, now);
  double days = 0;
  int rc = inner->xCurrentTime(inner, &days);
  // Converting a double out of range is undefined; SQLite's own fallback
  // clamps.
  double milliseconds = days * 86400000.0;
  *now = milliseconds > -9.2e18 && milliseconds < 9.2e18
             ? (sqlite3_int64)milliseconds
             : 0;
  return rc;
}

int evolu_codec_register(const char *name, const char *inner_name) {
  if (name == NULL) return SQLITE_MISUSE;
  // A build with SQLITE_THREADSAFE=0, as the wasm, has no mutex functions,
  // and its single thread needs none. The core's files see only sqlite3.h,
  // where the macro is undefined natively, which keeps the mutex there. A
  // static mutex needs no initialized SQLite.
#if !defined(SQLITE_THREADSAFE) || SQLITE_THREADSAFE
  sqlite3_mutex *mutex = sqlite3_mutex_alloc(SQLITE_MUTEX_STATIC_APP1);
  sqlite3_mutex_enter(mutex);
#endif
  // sqlite3_vfs_find initializes SQLite and finds nothing when that fails.
  sqlite3_vfs *inner = sqlite3_vfs_find(inner_name);
  sqlite3_vfs *existing = sqlite3_vfs_find(name);
  size_t name_size = strlen(name) + 1;
  CodecVfs *vfs = NULL;
  int rc;
  if (inner == NULL) {
    rc = SQLITE_ERROR;
  } else if (inner->xOpen == codec_open) {
    // Both layers' journals would find the outer database file, whose codec
    // the inner open left without the key, and store their records in
    // plaintext.
    rc = SQLITE_MISUSE;
  } else if (existing != NULL) {
    rc = existing->xOpen == codec_open && ((CodecVfs *)existing)->inner == inner
             ? SQLITE_OK
             : SQLITE_MISUSE;
  } else if ((vfs = evolu_calloc(1, sizeof *vfs + name_size)) == NULL) {
    rc = SQLITE_NOMEM;
  } else {
    char *vfs_name = (char *)(vfs + 1);
    memcpy(vfs_name, name, name_size);
    vfs->inner = inner;
    vfs->base.iVersion = 2;
    vfs->base.szOsFile = (int)CODEC_FILE_SIZE + inner->szOsFile;
    vfs->base.mxPathname = inner->mxPathname;
    vfs->base.zName = vfs_name;
    vfs->base.xOpen = codec_open;
    vfs->base.xDelete = codec_delete;
    vfs->base.xAccess = codec_access;
    vfs->base.xFullPathname = codec_full_pathname;
    // SQLite calls xDlOpen, xDlError, xDlSym and xDlClose only to load an
    // extension, which every build of the core omits
    // (SQLITE_OMIT_LOAD_EXTENSION), so they stay NULL, as the inner VFS's are.
    vfs->base.xRandomness = codec_randomness;
    vfs->base.xSleep = codec_sleep;
    vfs->base.xCurrentTime = codec_current_time;
    vfs->base.xGetLastError = codec_get_last_error;
    vfs->base.xCurrentTimeInt64 = codec_current_time_int64;
    // Registered for the life of the process, so never freed. It fails only
    // when SQLite can't initialize, which sqlite3_vfs_find did.
    rc = sqlite3_vfs_register(&vfs->base, 0);
  }
#if !defined(SQLITE_THREADSAFE) || SQLITE_THREADSAFE
  sqlite3_mutex_leave(mutex);
#endif
  return rc;
}

int evolu_codec_open(const char *filename, sqlite3 **db, const char *vfs,
                     const uint8_t *key, int flags) {
  // SQLCipher's files need SQLCipher's checksums, and a flag the codec doesn't
  // know would otherwise pass for 0, with checksums another build can't read.
  // Another VFS would skip the codec's refusals, also without a key.
  sqlite3_vfs *codec_vfs = sqlite3_vfs_find(vfs);
  if (((flags & EVOLU_CODEC_SQLCIPHER_FILES) &&
       (flags & EVOLU_CODEC_PLAINTEXT_CHECKSUMS)) ||
      (flags &
       ~(EVOLU_CODEC_SQLCIPHER_FILES | EVOLU_CODEC_PLAINTEXT_CHECKSUMS)) ||
      codec_vfs == NULL || codec_vfs->xOpen != codec_open) {
    *db = NULL;
    return SQLITE_MISUSE;
  }
  PendingKey own = {key, flags, 0};
  PendingKey *previous = pending;
  pending = &own;
  int rc = sqlite3_open_v2(filename, db,
                           SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE |
                               SQLITE_OPEN_EXRESCODE | SQLITE_OPEN_NOMUTEX,
                           vfs);
  pending = previous;
  if (rc != SQLITE_OK) return rc;
  rc = evolu_core_register(*db);
  if (rc != SQLITE_OK) return rc;
  // SQLite ignores ATTACH's KEY clause, so a database written through ATTACH
  // would be stored in plaintext. VACUUM and VACUUM INTO still write. It
  // fails only for an option the SQLite doesn't know, and the core compiles
  // against the sqlite3.h that defines it.
  sqlite3_db_config(*db, SQLITE_DBCONFIG_ENABLE_ATTACH_WRITE, 0, NULL);
  if (key != NULL) {
    if (!own.is_taken) return SQLITE_MISUSE;
    // The IV and the HMAC at the end of each page, for a new database. An
    // existing database keeps what its header says.
    int reserved = EVOLU_CODEC_RESERVED_SIZE;
    sqlite3_file_control(*db, "main", SQLITE_FCNTL_RESERVE_BYTES, &reserved);
    rc = sqlite3_exec(*db, "PRAGMA secure_delete = ON", NULL, NULL, NULL);
    if (rc != SQLITE_OK) return rc;
  }
  // SQLite reads a file only when a statement needs it, so the open reads the
  // schema now: a hot journal is rolled back, and a wrong key or a file that
  // isn't a database fails the open rather than the first statement.
  return sqlite3_exec(*db, "SELECT 1 FROM sqlite_schema", NULL, NULL, NULL);
}

int evolu_codec_take_failure(sqlite3 *db, evolu_codec_failure *failure) {
  if (db == NULL) return SQLITE_MISUSE;
  // sqlite3_file_control sets file only when it succeeds: a connection whose
  // open failed has no database for "main", and one in memory has a file
  // without methods.
  sqlite3_file *file = NULL;
  sqlite3_file_control(db, "main", SQLITE_FCNTL_FILE_POINTER, &file);
  if (file == NULL || file->pMethods != &codec_io_methods)
    return SQLITE_NOTFOUND;
  CodecFile *database = (CodecFile *)file;
  *failure = database->failure;
  database->failure.type = EVOLU_CODEC_FAILURE_NONE;
  database->failure.page_number = 0;
  return SQLITE_OK;
}

#ifdef EVOLU_TEST_HOOKS
const uint8_t *evolu_test_codec_scratch(sqlite3 *db, size_t *size) {
  sqlite3_file *file = NULL;
  sqlite3_file_control(db, "main", SQLITE_FCNTL_FILE_POINTER, &file);
  const CodecFile *database = (const CodecFile *)file;
  *size = database->scratch_size;
  return database->scratch;
}
#endif
