/*
 * The codec VFS over the host's default VFS (unix): keyed opens, reads and
 * writes of whole pages, rollback journals, and the safeguards of
 * src/evolu_codec.h. Files live in a temporary directory the suite creates and
 * removes. Test names start with codec_, so the suite runs alone with
 * `node packages/sqlite-core/scripts/test.mts codec_`.
 */
// mkdtemp, which macOS declares only with _DARWIN_C_SOURCE.
#define _POSIX_C_SOURCE 200809L
#define _DARWIN_C_SOURCE

#include "test.h"

#include "evolu_codec.h"
#include "evolu_crypto.h"
#include "evolu_skiplist.h"
#include "sqlcipher_pages.h"
#include "sqlite3.h"
#include "sqlite_allocator.h"

#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

static const char vfs_name[] = "evolu-codec-test";

static const uint8_t test_key[EVOLU_CODEC_KEY_SIZE] = {
    1,  2,  3,  4,  5,  6,  7,  8,  9,  10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32};

static const uint8_t other_key[EVOLU_CODEC_KEY_SIZE] = {
    32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17,
    16, 15, 14, 13, 12, 11, 10, 9,  8,  7,  6,  5,  4,  3,  2,  1};

static char directory[256];

/*
 * Creates the temporary directory and registers the VFS once, at the first
 * test that runs, so a filter that skips the suite creates nothing. Returns 0
 * when that fails, which the test's CHECK reports.
 */
static int set_up(void) {
  if (directory[0] != '\0') return 1;
  const char *tmp = getenv("TMPDIR");
  snprintf(directory, sizeof directory, "%s/evolu-codec-XXXXXX",
           tmp != NULL && tmp[0] != '\0' ? tmp : "/tmp");
  if (mkdtemp(directory) == NULL) {
    directory[0] = '\0';
    return 0;
  }
  return evolu_codec_register(vfs_name, NULL) == SQLITE_OK;
}

/* Writes directory/name into path, which holds 512 bytes. */
static void path_of(char path[512], const char *name) {
  snprintf(path, 512, "%s/%s", directory, name);
}

/* Reads a whole file into a malloc'd buffer, or returns NULL. */
static uint8_t *read_file(const char *path, size_t *size) {
  FILE *file = fopen(path, "rb");
  if (file == NULL) return NULL;
  fseek(file, 0, SEEK_END);
  long length = ftell(file);
  fseek(file, 0, SEEK_SET);
  uint8_t *bytes = malloc(length > 0 ? (size_t)length : 1);
  if (bytes != NULL && fread(bytes, 1, (size_t)length, file) != (size_t)length) {
    free(bytes);
    bytes = NULL;
  }
  fclose(file);
  *size = (size_t)length;
  return bytes;
}

static int write_file(const char *path, const uint8_t *bytes, size_t size) {
  FILE *file = fopen(path, "wb");
  if (file == NULL) return 0;
  int ok = fwrite(bytes, 1, size, file) == size;
  return fclose(file) == 0 && ok;
}

static int copy_file(const char *from, const char *to) {
  size_t size;
  uint8_t *bytes = read_file(from, &size);
  if (bytes == NULL) return 0;
  int ok = write_file(to, bytes, size);
  free(bytes);
  return ok;
}

static int file_exists(const char *path) { return access(path, F_OK) == 0; }

static int contains(const uint8_t *bytes, size_t size, const void *needle,
                    size_t needle_size) {
  for (size_t i = 0; i + needle_size <= size; i++)
    if (memcmp(bytes + i, needle, needle_size) == 0) return 1;
  return 0;
}

/* Whether the file at path holds exactly what the other file holds. */
static int same_files(const char *path, const char *other) {
  size_t size, other_size;
  uint8_t *bytes = read_file(path, &size);
  uint8_t *other_bytes = read_file(other, &other_size);
  int same = bytes != NULL && other_bytes != NULL && size == other_size &&
             memcmp(bytes, other_bytes, size) == 0;
  free(bytes);
  free(other_bytes);
  return same;
}

/* Removes the database at path and its journal. */
static void remove_database(const char *path) {
  char journal[600];
  snprintf(journal, sizeof journal, "%s-journal", path);
  unlink(path);
  unlink(journal);
}

/* Returns the integer the query's first row starts with, or -1. */
static long long query_int(sqlite3 *db, const char *sql) {
  sqlite3_stmt *statement = NULL;
  long long value = -1;
  if (sqlite3_prepare_v2(db, sql, -1, &statement, NULL) == SQLITE_OK &&
      sqlite3_step(statement) == SQLITE_ROW)
    value = sqlite3_column_int64(statement, 0);
  sqlite3_finalize(statement);
  return value;
}

/* The secret every row of a test table holds, which no file may store. */
static const char secret[] = "evolu-secret-row";

/*
 * Creates table t with rows rows of the secret followed by the row's number,
 * padded to fill about a page each, and returns the step's result.
 */
static int create_rows(sqlite3 *db, int rows) {
  int rc = sqlite3_exec(db, "create table t (id integer primary key, v text)",
                        NULL, NULL, NULL);
  if (rc != SQLITE_OK) return rc;
  char sql[256];
  snprintf(sql, sizeof sql,
           "with recursive n(i) as (select 1 union all select i + 1 from n "
           "where i < %d) insert into t select i, '%s' || i || "
           "printf('%%.3000c', 'x') from n",
           rows, secret);
  return sqlite3_exec(db, sql, NULL, NULL, NULL);
}

static int open_db(const char *path, const uint8_t *key, sqlite3 **db) {
  return evolu_codec_open(path, db, vfs_name, key, 0);
}

static void codec_encrypted_database_stores_no_plaintext_and_reads_back(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "round-trip.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 50), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  size_t size;
  uint8_t *bytes = read_file(path, &size);
  CHECK(bytes != NULL && size > 50 * 3000);
  int stores_plaintext = contains(bytes, size, "SQLite format 3", 15) ||
                         contains(bytes, size, secret, sizeof secret - 1) ||
                         contains(bytes, size, "create table", 12);
  // The reserved bytes, unencrypted in byte 20 of page 1.
  int reserves = bytes[20] == EVOLU_CODEC_RESERVED_SIZE;
  free(bytes);
  CHECK(!stores_plaintext);
  CHECK(reserves);

  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t where v like '" "evolu-"
                             "secret-row%'"),
               50);
  CHECK_EQ_INT(query_int(db, "select length(v) from t where id = 50"), 3018);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_database_with_another_key_fails_with_notadb_unchanged(void) {
  CHECK(set_up());
  char path[512];
  char copy[512];
  path_of(path, "other-key.db");
  path_of(copy, "other-key-copy.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK(copy_file(path, copy));

  CHECK_EQ_INT(open_db(path, other_key, &db), SQLITE_NOTADB);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  CHECK_EQ_INT(failure.page_number, 1);
  // Taking it clears it.
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
  sqlite3_close(db);
  CHECK(same_files(path, copy));
}

static void codec_plaintext_database_is_plain_sqlite(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "plaintext.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  // The default VFS opens it.
  CHECK_EQ_INT(sqlite3_open_v2(path, &db, SQLITE_OPEN_READWRITE, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_key_opens_only_a_database_file(void) {
  CHECK(set_up());
  sqlite3 *db = NULL;
  // An in-memory database never reaches the VFS, so it can't be keyed.
  CHECK_EQ_INT(open_db(":memory:", test_key, &db), SQLITE_MISUSE);
  sqlite3_close(db);
}

static void codec_refuses_turning_secure_delete_off(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "secure-delete.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "pragma secure_delete"), 1);

  static const char *const refused[] = {
      "pragma secure_delete = off", "pragma secure_delete = FAST",
      "pragma main.secure_delete = 0", "pragma secure_delete = 2"};
  for (size_t i = 0; i < sizeof refused / sizeof refused[0]; i++) {
    CHECK_EQ_INT(sqlite3_exec(db, refused[i], NULL, NULL, NULL), SQLITE_ERROR);
    CHECK(strstr(sqlite3_errmsg(db), "secure_delete") != NULL);
    evolu_codec_failure failure;
    CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
    CHECK_EQ_INT(query_int(db, "pragma secure_delete"), 1);
  }
  // Every spelling SQLite reads as on.
  static const char *const accepted[] = {
      "pragma secure_delete = On", "pragma secure_delete = yes",
      "pragma secure_delete = TRUE", "pragma secure_delete = 1"};
  for (size_t i = 0; i < sizeof accepted / sizeof accepted[0]; i++)
    CHECK_EQ_INT(sqlite3_exec(db, accepted[i], NULL, NULL, NULL), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  // A plaintext database can turn it off.
  remove_database(path);
  CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db, "pragma secure_delete = off", NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "pragma secure_delete"), 0);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_vacuum_changing_the_page_size_fails_and_keeps_the_database(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "vacuum.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 5), SQLITE_OK);
  long long page_size = query_int(db, "pragma page_size");
  CHECK_EQ_INT(sqlite3_exec(db, "pragma page_size = 16384", NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db, "vacuum", NULL, NULL, NULL),
               SQLITE_IOERR_WRITE);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "pragma page_size"), page_size);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 5);
  // A VACUUM that keeps the page size works.
  CHECK_EQ_INT(sqlite3_exec(db, "vacuum", NULL, NULL, NULL), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 5);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_altered_page_fails_with_corrupt_naming_the_page(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "altered.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 10), SQLITE_OK);
  long long page_size = query_int(db, "pragma page_size");
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  size_t size;
  uint8_t *bytes = read_file(path, &size);
  CHECK(bytes != NULL && size >= (size_t)page_size * 4);
  // A byte of page 3, which holds rows.
  bytes[2 * page_size + 100] ^= 1;
  int written = write_file(path, bytes, size);
  free(bytes);
  CHECK(written);

  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db, "select * from t", NULL, NULL, NULL),
               SQLITE_CORRUPT);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  CHECK_EQ_INT(failure.page_number, 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_reads_and_writes_rows_spanning_many_overflow_pages(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "large.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db,
                            "create table b (id integer primary key, v blob);"
                            "insert into b values (1, randomblob(3000000)),"
                            " (2, zeroblob(1048577));"
                            "create table c as select * from b",
                            NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  // Neither a mapping nor direct overflow reads, which read parts of pages,
  // read around the codec.
  CHECK_EQ_INT(sqlite3_exec(db, "pragma mmap_size = 268435456", NULL, NULL,
                            NULL),
               SQLITE_OK);
  // Two copies of each row in pages of their own read back the same.
  CHECK_EQ_INT(query_int(db, "select count(*) from b join c using (id) "
                             "where b.v = c.v"),
               2);
  CHECK_EQ_INT(query_int(db, "select length(v) from b where id = 2"), 1048577);
  CHECK_EQ_INT(query_int(db, "select count(*) from pragma_integrity_check "
                             "where integrity_check = 'ok'"),
               1);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_files_have_no_subpage_reads_and_version_1_methods(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "methods.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  sqlite3_file *file = NULL;
  CHECK_EQ_INT(
      sqlite3_file_control(db, "main", SQLITE_FCNTL_FILE_POINTER, &file),
      SQLITE_OK);
  CHECK(file != NULL && file->pMethods != NULL);
  // Never xShmMap or xFetch, through which SQLite would read around it.
  CHECK_EQ_INT(file->pMethods->iVersion, 1);
  CHECK_EQ_INT(file->pMethods->xDeviceCharacteristics(file) &
                   ~SQLITE_IOCAP_POWERSAFE_OVERWRITE,
               0);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  // Files other than a main database, its journal and the super-journal.
  sqlite3_vfs *vfs = sqlite3_vfs_find(vfs_name);
  CHECK(vfs != NULL);
  static const int refused[] = {SQLITE_OPEN_TEMP_DB, SQLITE_OPEN_TRANSIENT_DB,
                                SQLITE_OPEN_TEMP_JOURNAL,
                                SQLITE_OPEN_SUBJOURNAL, SQLITE_OPEN_WAL};
  sqlite3_file *other = malloc((size_t)vfs->szOsFile);
  CHECK(other != NULL);
  for (size_t i = 0; i < sizeof refused / sizeof refused[0]; i++) {
    memset(other, 0, (size_t)vfs->szOsFile);
    int flags = refused[i] | SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE;
    int rc = vfs->xOpen(vfs, path, other, flags, NULL);
    int opened = other->pMethods != NULL;
    if (opened) other->pMethods->xClose(other);
    if (rc != SQLITE_CANTOPEN || opened) {
      free(other);
      CHECK(!"another file type opened");
    }
  }
  free(other);
}

/* Returns the main database's file of db, or NULL. */
static sqlite3_file *database_file(sqlite3 *db) {
  sqlite3_file *file = NULL;
  sqlite3_file_control(db, "main", SQLITE_FCNTL_FILE_POINTER, &file);
  return file;
}

/* Flips one bit of the byte at offset in the file at path. */
static int flip_bit(const char *path, size_t offset) {
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  int ok = bytes != NULL && offset < size;
  if (ok) {
    bytes[offset] ^= 1;
    ok = write_file(path, bytes, size);
  }
  free(bytes);
  return ok;
}

/* Overwrites length bytes at offset in the file at path with value. */
static int fill_bytes(const char *path, size_t offset, size_t length,
                      uint8_t value) {
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  int ok = bytes != NULL && offset + length <= size;
  if (ok) {
    memset(bytes + offset, value, length);
    ok = write_file(path, bytes, size);
  }
  free(bytes);
  return ok;
}

static void codec_reads_part_of_page_1_decrypted_when_it_authenticates(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "partial.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  int page_size = (int)query_int(db, "pragma page_size");
  sqlite3_file *file = database_file(db);
  CHECK(file != NULL);

  uint8_t page[65536];
  uint8_t part[100];
  CHECK_EQ_INT(file->pMethods->xRead(file, page, page_size, 0), SQLITE_OK);
  CHECK_EQ_BYTES(page, "SQLite format 3", 16);
  // The header SQLite reads when it opens a database, and the change counter
  // it reads when a transaction starts with pages cached.
  CHECK_EQ_INT(file->pMethods->xRead(file, part, 100, 0), SQLITE_OK);
  CHECK_EQ_BYTES(part, page, 100);
  CHECK_EQ_INT(file->pMethods->xRead(file, part, 16, 24), SQLITE_OK);
  CHECK_EQ_BYTES(part, page + 24, 16);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);

  // Any other part of a page can't be read encrypted, also any part of page
  // 1 past its first 100 bytes.
  struct {
    int amount;
    sqlite3_int64 offset;
  } others[] = {{16, page_size + 16}, {16, 100}, {101, 0}, {200, 0}};
  static const uint8_t zeros[200];
  for (size_t i = 0; i < sizeof others / sizeof others[0]; i++) {
    memset(page, 0xff, sizeof zeros);
    CHECK_EQ_INT(
        file->pMethods->xRead(file, page, others[i].amount, others[i].offset),
        SQLITE_IOERR_READ);
    CHECK_EQ_BYTES(page, zeros, (size_t)others[i].amount);
    CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
  }

  // A page 1 that doesn't authenticate, as a crash can tear it, reads as
  // stored, so a hot journal can roll it back.
  CHECK(flip_bit(path, 200));
  size_t size;
  uint8_t *stored = read_file(path, &size);
  CHECK(stored != NULL);
  int read = file->pMethods->xRead(file, part, 100, 0);
  int is_stored = memcmp(part, stored, 100) == 0;
  free(stored);
  CHECK_EQ_INT(read, SQLITE_OK);
  CHECK(is_stored);
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
  sqlite3_close(db);
}

static void codec_connection_opened_while_empty_reads_another_page_size(void) {
  CHECK(set_up());
  static const char *const page_sizes[] = {"pragma page_size = 16384",
                                           "pragma page_size = 1024"};
  for (size_t i = 0; i < sizeof page_sizes / sizeof page_sizes[0]; i++) {
    char path[512];
    path_of(path, "empty-open.db");
    remove_database(path);
    sqlite3 *reader = NULL;
    sqlite3 *writer = NULL;
    CHECK_EQ_INT(open_db(path, test_key, &reader), SQLITE_OK);
    CHECK_EQ_INT(open_db(path, test_key, &writer), SQLITE_OK);
    CHECK_EQ_INT(sqlite3_exec(writer, page_sizes[i], NULL, NULL, NULL),
                 SQLITE_OK);
    CHECK_EQ_INT(create_rows(writer, 5), SQLITE_OK);
    CHECK_EQ_INT(sqlite3_close(writer), SQLITE_OK);

    // The reader keeps SQLite's default page size, so it reads page 1 whole
    // at that size first, after its header, whose read decrypts page 1 at its
    // own size into the scratch buffer, which it can fail to allocate.
    evolu_test_allocations_left = 0;
    long long rows = query_int(reader, "select count(*) from t");
    evolu_test_allocations_left = -1;
    CHECK_EQ_INT(rows, -1);
    CHECK_EQ_INT(sqlite3_errcode(reader), SQLITE_NOMEM);
    CHECK_EQ_INT(query_int(reader, "select count(*) from t"), 5);
    evolu_codec_failure failure;
    CHECK_EQ_INT(evolu_codec_take_failure(reader, &failure), SQLITE_OK);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
    CHECK_EQ_INT(sqlite3_close(reader), SQLITE_OK);
  }
}

static void codec_database_missing_its_last_byte_fails_with_corrupt(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "truncated.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db,
                            "create table b (v blob);"
                            "insert into b values (zeroblob(100000))",
                            NULL, NULL, NULL),
               SQLITE_OK);
  long long page_count = query_int(db, "pragma page_count");
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  CHECK(bytes != NULL);
  int written = write_file(path, bytes, size - 1);
  free(bytes);
  CHECK(written);

  // Zeros must not pass as the end of the blob.
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db, "select hex(v) from b", NULL, NULL, NULL),
               SQLITE_CORRUPT);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  CHECK_EQ_INT(failure.page_number, page_count);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/*
 * Leaves at path a database of 200 rows whose transaction crashed after SQLite
 * wrote updated pages into the database: a copy of the database and its hot
 * journal, taken while a connection held the transaction, which ran sql
 * after begin, open. Returns the step's result.
 */
static int create_crashed_database_with(const char *path, const uint8_t *key,
                                        const char *sql) {
  char source[512];
  char source_journal[600];
  char journal[600];
  snprintf(source, sizeof source, "%s-source", path);
  snprintf(source_journal, sizeof source_journal, "%s-journal", source);
  snprintf(journal, sizeof journal, "%s-journal", path);
  remove_database(source);
  remove_database(path);
  sqlite3 *db = NULL;
  int rc = open_db(source, key, &db);
  if (rc == SQLITE_OK) rc = create_rows(db, 200);
  // A small cache spills updated pages into the database before the commit.
  if (rc == SQLITE_OK)
    rc = sqlite3_exec(db, "pragma cache_size = 10; begin", NULL, NULL, NULL);
  if (rc == SQLITE_OK) rc = sqlite3_exec(db, sql, NULL, NULL, NULL);
  if (rc == SQLITE_OK && !(copy_file(source, path) &&
                           copy_file(source_journal, journal)))
    rc = SQLITE_ERROR;
  sqlite3_close(db);
  remove_database(source);
  return rc;
}

/* A crash in a transaction that updates every row, never page 1. */
static int create_crashed_database(const char *path, const uint8_t *key) {
  return create_crashed_database_with(path, key,
                                      "update t set v = 'updated' || id");
}

/* Whether db holds the 200 rows the crashed transactions updated, as before. */
static int has_original_rows(sqlite3 *db) {
  return query_int(db, "select count(*) from t where v like 'evolu-"
                       "secret-row%'") == 200 &&
         query_int(db, "select count(*) from pragma_integrity_check "
                       "where integrity_check = 'ok'") == 1;
}

static void codec_journal_page_1_record_gives_the_salt_a_crash_tore(void) {
  CHECK(set_up());
  // Page 1's record first, and in a later segment of the journal, which
  // starts after the first spill synced the journal.
  static const char *const transactions[] = {
      "pragma user_version = 7; update t set v = 'updated' || id",
      "update t set v = 'updated' || id where id <= 100;"
      "pragma user_version = 7; update t set v = 'updated' || id"};
  for (size_t i = 0; i < sizeof transactions / sizeof transactions[0]; i++) {
    char path[512];
    char journal[600];
    path_of(path, "torn-salt.db");
    snprintf(journal, sizeof journal, "%s-journal", path);
    CHECK_EQ_INT(create_crashed_database_with(path, test_key, transactions[i]),
                 SQLITE_OK);
    // The crash tore page 1 in its salt.
    CHECK(fill_bytes(path, 0, 16, 0));

    sqlite3 *db = NULL;
    CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
    CHECK(!file_exists(journal));
    CHECK(has_original_rows(db));
    CHECK_EQ_INT(query_int(db, "pragma user_version"), 0);
    CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  }
}

static void codec_hot_journal_takes_the_salt_from_the_first_bytes_last(void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  path_of(path, "first-bytes-salt.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  CHECK_EQ_INT(create_crashed_database(path, test_key), SQLITE_OK);
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  CHECK(bytes != NULL);
  uint8_t page_size[2] = {bytes[16], bytes[17]};
  free(bytes);
  // Page 1 stores no page size, so neither it nor the journal, which has no
  // page-1 record, gives the salt the records need.
  CHECK(fill_bytes(path, 16, 2, 0));

  sqlite3 *db = NULL;
  // The rollback succeeds; then page 1, whose page size is unauthenticated,
  // fails SQLite's own check.
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_NOTADB);
  sqlite3_close(db);
  CHECK(!file_exists(journal));
  CHECK(fill_bytes(path, 16, 1, page_size[0]));
  CHECK(fill_bytes(path, 17, 1, page_size[1]));
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK(has_original_rows(db));
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_proven_key_ends_a_journal_at_a_record_that_fails(void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  path_of(path, "stale-record.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  CHECK_EQ_INT(create_crashed_database(path, test_key), SQLITE_OK);
  size_t size;
  uint8_t *journal_bytes = read_file(journal, &size);
  CHECK(journal_bytes != NULL && size > 28);
  // The records start after the header, which takes a sector.
  size_t sector_size = (size_t)journal_bytes[20] << 24 |
                       (size_t)journal_bytes[21] << 16 |
                       (size_t)journal_bytes[22] << 8 | journal_bytes[23];
  free(journal_bytes);
  // A byte in the first record's page, which SQLite plays back first, as a
  // stale page after a new page number left by synchronous = OFF.
  CHECK(flip_bit(journal, sector_size + 4 + 100));

  // Page 1 of the database proves the key, so the record ends the journal as
  // a checksum that differs would.
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK(!file_exists(journal));
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/*
 * Copies the database at from and the journal of a transaction that ran sql
 * after begin, and crashed after SQLite wrote updated pages into the
 * database, over the database at to and its journal. Returns the step's
 * result.
 */
static int crash_over(const char *from, const char *to, const uint8_t *key,
                      const char *sql) {
  char from_journal[600];
  char to_journal[600];
  snprintf(from_journal, sizeof from_journal, "%s-journal", from);
  snprintf(to_journal, sizeof to_journal, "%s-journal", to);
  sqlite3 *db = NULL;
  int rc = open_db(from, key, &db);
  if (rc == SQLITE_OK)
    rc = sqlite3_exec(db, "pragma cache_size = 10; begin", NULL, NULL, NULL);
  if (rc == SQLITE_OK) rc = sqlite3_exec(db, sql, NULL, NULL, NULL);
  if (rc == SQLITE_OK &&
      !(copy_file(from, to) && copy_file(from_journal, to_journal)))
    rc = SQLITE_ERROR;
  sqlite3_close(db);
  remove_database(from);
  return rc;
}

static void codec_proven_key_keeps_its_salt_for_another_hot_journal(void) {
  CHECK(set_up());
  char path[512];
  char source[512];
  char journal[600];
  path_of(path, "proven-salt.db");
  path_of(source, "proven-salt-source.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  remove_database(path);
  sqlite3 *reader = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &reader), SQLITE_OK);
  CHECK_EQ_INT(create_rows(reader, 200), SQLITE_OK);
  CHECK(has_original_rows(reader));
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  CHECK(bytes != NULL);
  uint8_t salt[16];
  memcpy(salt, bytes, sizeof salt);
  free(bytes);

  // Another connection's transaction, which journals no page 1, crashed, and
  // page 1's salt was torn.
  CHECK(copy_file(path, source));
  CHECK_EQ_INT(crash_over(source, path, test_key,
                          "update t set v = 'updated' || id"),
               SQLITE_OK);
  CHECK(fill_bytes(path, 0, 16, 0));

  // The rollback completes with the proven salt, and page 1, which it
  // doesn't restore, then fails.
  CHECK_EQ_INT(sqlite3_exec(reader, "select count(*) from t", NULL, NULL, NULL),
               SQLITE_NOTADB);
  CHECK(!file_exists(journal));
  for (size_t i = 0; i < sizeof salt; i++)
    CHECK(fill_bytes(path, i, 1, salt[i]));
  CHECK(has_original_rows(reader));
  CHECK_EQ_INT(sqlite3_close(reader), SQLITE_OK);
}

static void codec_new_database_after_a_rolled_back_first_transaction_gets_a_random_salt(
    void) {
  CHECK(set_up());
  char path[512];
  char source[512];
  char journal[600];
  path_of(path, "new-salt.db");
  path_of(source, "new-salt-source.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  remove_database(path);
  remove_database(source);
  // A new database's first transaction spilled pages after page 1, whose
  // place it left as zeros, and crashed. Its journal journals no page.
  char sql[256];
  snprintf(sql, sizeof sql,
           "create table t (id integer primary key, v text);"
           "with recursive n(i) as (select 1 union all select i + 1 from n "
           "where i < 200) insert into t select i, printf('%%.3000c', 'x') "
           "from n");
  CHECK_EQ_INT(crash_over(source, path, test_key, sql), SQLITE_OK);
  CHECK(fill_bytes(path, 0, 16, 0));

  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK(!file_exists(journal));
  CHECK_EQ_INT(query_int(db, "pragma page_count"), 0);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  CHECK(bytes != NULL);
  static const uint8_t zeros[16];
  int is_zero_salt = memcmp(bytes, zeros, sizeof zeros) == 0;
  free(bytes);
  CHECK(!is_zero_salt);
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_plaintext_hot_journal_rolls_back_without_a_key(void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  path_of(path, "plaintext-hot.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  CHECK_EQ_INT(create_crashed_database(path, NULL), SQLITE_OK);
  CHECK(file_exists(journal));
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_OK);
  CHECK(!file_exists(journal));
  CHECK(has_original_rows(db));
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/*
 * A crash that tore a plaintext database's page 1, which SQLite wrote only
 * after it journaled and synced it, leaves a plaintext page-1 record in the
 * journal, which the rollback restores.
 */
static void codec_plaintext_hot_journal_restores_a_torn_page_1(void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  path_of(path, "plaintext-torn.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  CHECK_EQ_INT(create_crashed_database_with(path, NULL,
                                            "pragma user_version = 7; update "
                                            "t set v = 'updated' || id"),
               SQLITE_OK);
  CHECK(fill_bytes(path, 0, 16, 0));

  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_OK);
  CHECK(!file_exists(journal));
  CHECK(has_original_rows(db));
  CHECK_EQ_INT(query_int(db, "pragma user_version"), 0);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_journal_left_before_its_first_sync_is_not_hot(void) {
  CHECK(set_up());
  char path[512];
  char source[512];
  char journal[600];
  char source_journal[600];
  path_of(path, "unsynced.db");
  path_of(source, "unsynced-source.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  snprintf(source_journal, sizeof source_journal, "%s-journal", source);
  remove_database(path);
  remove_database(source);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(source, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 20), SQLITE_OK);
  // A transaction that spills nothing, so SQLite hasn't synced its journal,
  // whose magic is still zeros, when it crashes.
  CHECK_EQ_INT(sqlite3_exec(db, "begin; update t set v = 'updated' where id < 3",
                            NULL, NULL, NULL),
               SQLITE_OK);
  int copied = copy_file(source, path) && copy_file(source_journal, journal);
  sqlite3_close(db);
  remove_database(source);
  CHECK(copied);
  size_t size;
  uint8_t *bytes = read_file(journal, &size);
  CHECK(bytes != NULL && size > 28);
  int is_unsynced = bytes[0] == 0 && bytes[16] + bytes[17] + bytes[18] + bytes[19] != 0;
  free(bytes);
  CHECK(is_unsynced);

  // Without the key, it fails as without a journal: page 1 isn't SQLite's.
  CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_NOTADB);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
  sqlite3_close(db);

  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t where v like 'evolu-"
                             "secret-row%'"),
               20);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/*
 * Writes at path a database of rows rows in SQLCipher's layout. Plain SQLite
 * writes the pages, which are then encrypted from the format. With
 * page_size_bytes, page 1's IV is found by trying so its encrypted bytes 16
 * and 17, where SQLite reads the page size, are those, as about one of 8192
 * page 1 writes of SQLCipher leaves them. Returns 0 when a step fails.
 */
static int create_sqlcipher_database(const char *path, int rows,
                                     const uint8_t *page_size_bytes) {
  char plain[600];
  snprintf(plain, sizeof plain, "%s-plain", path);
  remove_database(plain);
  remove_database(path);
  sqlite3 *db = NULL;
  int reserved = EVOLU_CODEC_RESERVED_SIZE;
  int ok = sqlite3_open_v2(plain, &db,
                           SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
                           NULL) == SQLITE_OK &&
           // The page size first, which would reset the reserved bytes.
           sqlite3_exec(db, "pragma page_size = 4096", NULL, NULL, NULL) ==
               SQLITE_OK &&
           sqlite3_file_control(db, "main", SQLITE_FCNTL_RESERVE_BYTES,
                                &reserved) == SQLITE_OK &&
           create_rows(db, rows) == SQLITE_OK;
  sqlite3_close(db);
  size_t size;
  uint8_t *bytes = ok ? read_file(plain, &size) : NULL;
  remove_database(plain);
  uint8_t *encrypted = bytes != NULL ? malloc(size) : NULL;
  // The file control returned the bytes asked for before in reserved.
  if (encrypted == NULL || size % 4096 != 0 ||
      bytes[20] != EVOLU_CODEC_RESERVED_SIZE) {
    free(bytes);
    free(encrypted);
    return 0;
  }
  static const uint8_t salt[16] = {0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5,
                                   0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab,
                                   0xac, 0xad, 0xae, 0xaf};
  // Page 1's first encrypted block is E(bytes 16 to 31 XOR IV).
  evolu_aes256 aes;
  evolu_aes256_init(&aes, test_key);
  uint8_t iv[16] = {0};
  for (uint32_t attempt = 0; page_size_bytes != NULL; attempt++) {
    memcpy(iv, &attempt, sizeof attempt);
    uint8_t chain[16];
    uint8_t block[16];
    memcpy(chain, iv, sizeof chain);
    memcpy(block, bytes + 16, sizeof block);
    evolu_aes256_cbc_encrypt(&aes, chain, block, sizeof block);
    if (block[0] == page_size_bytes[0] && block[1] == page_size_bytes[1])
      break;
  }
  evolu_aes256_wipe(&aes);
  for (size_t at = 0; at < size; at += 4096) {
    uint32_t page_number = (uint32_t)(at / 4096) + 1;
    if (page_number > 1) memset(iv, (int)page_number, sizeof iv);
    build_sqlcipher_page(test_key, salt, iv, page_number, bytes + at, 4096,
                         encrypted + at);
  }
  ok = write_file(path, encrypted, size);
  free(bytes);
  free(encrypted);
  return ok;
}

static void codec_opens_sqlcipher_files_only_when_allowed_whatever_their_page_size_bytes(
    void) {
  CHECK(set_up());
  // Another page size, a smaller one, and none.
  static const uint8_t page_sizes[][2] = {{0x20, 0x00}, {0x04, 0x00},
                                          {0x00, 0x00}};
  char path[512];
  path_of(path, "sqlcipher.db");
  for (size_t i = 0; i < sizeof page_sizes / sizeof page_sizes[0]; i++) {
    CHECK(create_sqlcipher_database(path, 10, page_sizes[i]));
    sqlite3 *db = NULL;
    CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_NOTADB);
    sqlite3_close(db);

    CHECK_EQ_INT(evolu_codec_open(path, &db, vfs_name, test_key,
                                  EVOLU_CODEC_SQLCIPHER_FILES),
                 SQLITE_OK);
    CHECK_EQ_INT(query_int(db, "select count(*) from t where v like 'evolu-"
                               "secret-row%'"),
                 10);
    CHECK_EQ_INT(query_int(db, "select count(*) from pragma_integrity_check "
                               "where integrity_check = 'ok'"),
                 1);
    evolu_codec_failure failure;
    CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
    CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  }
}

/*
 * A VFS over the default one that copies the files of crash_path to
 * crash_copy before its crash_at-th write and fails that write and every
 * later one, as a power loss leaves the files.
 */
static sqlite3_vfs *crash_inner;
static int crash_writes;
static int crash_at;
static int has_crashed;
static const char *crash_path;
static const char *crash_copy;
/*
 * When not 0, the files report this sector size and no device
 * characteristics, as the web's OPFS pool does, and a crash at a write of the
 * database's page 1 leaves zeros in place of its salt, as a torn sector can.
 */
static int crash_sector_size;

typedef struct {
  sqlite3_file base;
  sqlite3_file *inner;
  int is_database;
} CrashFile;

static int crash_write(sqlite3_file *file, const void *buffer, int amount,
                       sqlite3_int64 offset) {
  if (!has_crashed && ++crash_writes == crash_at) {
    char journal[600];
    char copy_journal[600];
    snprintf(journal, sizeof journal, "%s-journal", crash_path);
    snprintf(copy_journal, sizeof copy_journal, "%s-journal", crash_copy);
    remove_database(crash_copy);
    if (!copy_file(crash_path, crash_copy) ||
        (file_exists(journal) && !copy_file(journal, copy_journal)))
      return SQLITE_IOERR_WRITE;
    has_crashed = 1;
    if (crash_sector_size != 0 && ((CrashFile *)file)->is_database &&
        offset == 0 && !fill_bytes(crash_copy, 0, 16, 0))
      return SQLITE_IOERR_WRITE;
  }
  if (has_crashed) return SQLITE_IOERR_WRITE;
  sqlite3_file *inner = ((CrashFile *)file)->inner;
  return inner->pMethods->xWrite(inner, buffer, amount, offset);
}

#define CRASH_FORWARD(name, parameters, arguments)                             \
  static int crash_##name parameters {                                         \
    sqlite3_file *inner = ((CrashFile *)file)->inner;                          \
    return inner->pMethods->x##name arguments;                                 \
  }

CRASH_FORWARD(Close, (sqlite3_file * file), (inner))
// Counted, so a test can tell whether the codec read the file.
static int crash_reads;

static int crash_Read(sqlite3_file *file, void *buffer, int amount,
                      sqlite3_int64 offset) {
  crash_reads++;
  sqlite3_file *inner = ((CrashFile *)file)->inner;
  return inner->pMethods->xRead(inner, buffer, amount, offset);
}
CRASH_FORWARD(Truncate, (sqlite3_file * file, sqlite3_int64 size),
              (inner, size))
CRASH_FORWARD(Sync, (sqlite3_file * file, int flags), (inner, flags))
CRASH_FORWARD(FileSize, (sqlite3_file * file, sqlite3_int64 *size),
              (inner, size))
CRASH_FORWARD(Lock, (sqlite3_file * file, int level), (inner, level))
CRASH_FORWARD(Unlock, (sqlite3_file * file, int level), (inner, level))
CRASH_FORWARD(CheckReservedLock, (sqlite3_file * file, int *result),
              (inner, result))
CRASH_FORWARD(FileControl, (sqlite3_file * file, int op, void *arg),
              (inner, op, arg))

static int crash_SectorSize(sqlite3_file *file) {
  sqlite3_file *inner = ((CrashFile *)file)->inner;
  return crash_sector_size != 0 ? crash_sector_size
                                : inner->pMethods->xSectorSize(inner);
}

static int crash_DeviceCharacteristics(sqlite3_file *file) {
  sqlite3_file *inner = ((CrashFile *)file)->inner;
  return crash_sector_size != 0
             ? 0
             : inner->pMethods->xDeviceCharacteristics(inner);
}

static const sqlite3_io_methods crash_io_methods = {
    1,
    crash_Close,
    crash_Read,
    crash_write,
    crash_Truncate,
    crash_Sync,
    crash_FileSize,
    crash_Lock,
    crash_Unlock,
    crash_CheckReservedLock,
    crash_FileControl,
    crash_SectorSize,
    crash_DeviceCharacteristics,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
};

static int crash_open(sqlite3_vfs *vfs, sqlite3_filename name,
                      sqlite3_file *file, int flags, int *out_flags) {
  (void)vfs;
  CrashFile *crash_file = (CrashFile *)file;
  crash_file->inner = (sqlite3_file *)(crash_file + 1);
  int rc = crash_inner->xOpen(crash_inner, name, crash_file->inner, flags,
                              out_flags);
  if (rc != SQLITE_OK) {
    if (crash_file->inner->pMethods != NULL)
      crash_file->inner->pMethods->xClose(crash_file->inner);
    crash_file->base.pMethods = NULL;
    return rc;
  }
  crash_file->base.pMethods = &crash_io_methods;
  crash_file->is_database = (flags & SQLITE_OPEN_MAIN_DB) != 0;
  return SQLITE_OK;
}

static const char crash_vfs_name[] = "evolu-codec-test-crash";
static const char crash_codec_vfs_name[] = "evolu-codec-test-over-crash";

/* Registers the crash VFS and a codec VFS over it, once. */
static int register_crash_vfs(void) {
  static sqlite3_vfs vfs;
  if (sqlite3_vfs_find(crash_vfs_name) == NULL) {
    crash_inner = sqlite3_vfs_find(NULL);
    vfs = *crash_inner;
    vfs.zName = crash_vfs_name;
    vfs.pNext = NULL;
    vfs.szOsFile = (int)sizeof(CrashFile) + crash_inner->szOsFile;
    vfs.xOpen = crash_open;
    if (sqlite3_vfs_register(&vfs, 0) != SQLITE_OK) return 0;
  }
  return evolu_codec_register(crash_codec_vfs_name, crash_vfs_name) ==
         SQLITE_OK;
}

/* A database by how it's opened, which decides its journals' checksums. */
typedef struct {
  const char *name;
  int flags;
} Kind;

static const Kind kinds[] = {
    {"native", 0},
    {"web", EVOLU_CODEC_PLAINTEXT_CHECKSUMS},
    {"sqlcipher", EVOLU_CODEC_SQLCIPHER_FILES},
};

static const char *const journal_modes[] = {
    "pragma journal_mode = delete", "pragma journal_mode = persist",
    "pragma journal_mode = truncate", "pragma locking_mode = exclusive"};

static const char *const synchronous_modes[] = {"pragma synchronous = full",
                                                "pragma synchronous = off"};

#define MATRIX_ROWS 12

/* Creates a database of MATRIX_ROWS rows of a kind at path. */
static int create_base(const Kind *kind, const char *path) {
  if (kind->flags & EVOLU_CODEC_SQLCIPHER_FILES)
    return create_sqlcipher_database(path, MATRIX_ROWS, NULL);
  remove_database(path);
  sqlite3 *db = NULL;
  int ok = evolu_codec_open(path, &db, vfs_name, test_key, kind->flags) ==
               SQLITE_OK &&
           create_rows(db, MATRIX_ROWS) == SQLITE_OK;
  return sqlite3_close(db) == SQLITE_OK && ok;
}

/*
 * The original and updated rows, the user version and whether the integrity
 * check passes: before the transaction MATRIX_ROWS, 0, 0, 1; after it 0,
 * MATRIX_ROWS, 8, 1.
 */
typedef struct {
  long long original;
  long long updated;
  long long version;
  long long ok;
} State;

static State state_of(sqlite3 *db) {
  State state = {
      query_int(db, "select count(*) from t where v like 'evolu-secret-row%'"),
      query_int(db, "select count(*) from t where v like 'updated%'"),
      query_int(db, "pragma user_version"),
      query_int(db, "select count(*) from pragma_integrity_check where "
                    "integrity_check = 'ok'")};
  return state;
}

static int is_before(State state) {
  return state.original == MATRIX_ROWS && state.updated == 0 &&
         state.version == 0 && state.ok == 1;
}

static int is_after(State state) {
  return state.original == 0 && state.updated == MATRIX_ROWS &&
         state.version == 8 && state.ok == 1;
}

/* Whether SQLite would roll the journal of the database at path back. */
static int has_hot_journal(const char *path) {
  char journal[600];
  snprintf(journal, sizeof journal, "%s-journal", path);
  size_t size = 0;
  uint8_t *bytes = file_exists(journal) ? read_file(journal, &size) : NULL;
  int hot = bytes != NULL && size > 0 && bytes[0] != 0;
  free(bytes);
  return hot;
}

/*
 * The transaction, which journals page 1 first and changes it again after
 * spills synced the journal, and ends with end.
 */
static void transaction_sql(char sql[512], const char *journal_mode,
                            const char *synchronous, const char *end) {
  snprintf(sql, 512,
           "%s; %s; pragma cache_size = 3; begin; pragma user_version = 7;"
           "update t set v = 'updated' || id where id <= %d;"
           "pragma user_version = 8; update t set v = 'updated' || id; %s",
           journal_mode, synchronous, MATRIX_ROWS / 2, end);
}

/*
 * Crashes the transaction at every write, as the crash VFS does, and checks
 * that opening each crash's files leaves the database wholly before or after
 * it, with no hot journal. Returns 0 with a message on the first that doesn't.
 */
static int crashes_roll_back(const Kind *kind, const char *journal_mode,
                             const char *synchronous, const char *base,
                             char message[200]) {
  char path[512];
  char copy[512];
  char sql[512];
  path_of(path, "matrix-work.db");
  path_of(copy, "matrix-copy.db");
  transaction_sql(sql, journal_mode, synchronous, "commit");
  int crashes = 0;
  for (int write = 1;; write++) {
    remove_database(path);
    if (!copy_file(base, path)) return 0;
    crash_writes = 0;
    crash_at = write;
    has_crashed = 0;
    crash_path = path;
    crash_copy = copy;
    sqlite3 *db = NULL;
    int rc = evolu_codec_open(path, &db, crash_codec_vfs_name, test_key,
                              kind->flags);
    if (rc == SQLITE_OK) rc = sqlite3_exec(db, sql, NULL, NULL, NULL);
    sqlite3_close(db);
    if (!has_crashed) {
      snprintf(message, 200, "committed with %d after %d crashes", rc,
               crashes);
      // Fewer writes than that: the transaction committed.
      return rc == SQLITE_OK && crashes > 20;
    }
    crashes++;
    rc = evolu_codec_open(copy, &db, vfs_name, test_key, kind->flags);
    State state = state_of(db);
    evolu_codec_failure failure = {EVOLU_CODEC_FAILURE_NONE, 0};
    evolu_codec_take_failure(db, &failure);
    sqlite3_close(db);
    if (rc != SQLITE_OK || !(is_before(state) || is_after(state)) ||
        failure.type != EVOLU_CODEC_FAILURE_NONE || has_hot_journal(copy)) {
      snprintf(message, 200,
               "write %d: open %d, %lld original, %lld updated, version %lld, "
               "integrity %lld, failure %d",
               write, rc, state.original, state.updated, state.version,
               state.ok, failure.type);
      return 0;
    }
  }
}

/*
 * Runs the transaction to its end, which rolls it back, and checks the
 * database in the same connection, after a later commit, and in a new one.
 */
static int rollback_restores(const Kind *kind, const char *journal_mode,
                             const char *synchronous, const char *base,
                             const char *end, char message[200]) {
  char path[512];
  char sql[512];
  path_of(path, "matrix-work.db");
  remove_database(path);
  if (!copy_file(base, path)) return 0;
  transaction_sql(sql, journal_mode, synchronous, end);
  sqlite3 *db = NULL;
  int rc = evolu_codec_open(path, &db, vfs_name, test_key, kind->flags);
  if (rc == SQLITE_OK) rc = sqlite3_exec(db, sql, NULL, NULL, NULL);
  State same = state_of(db);
  // A later commit writes the pages the rollback should have restored.
  if (rc == SQLITE_OK)
    rc = sqlite3_exec(db, "update t set v = v || '!' where id % 2 = 0", NULL,
                      NULL, NULL);
  State later = state_of(db);
  sqlite3_close(db);
  State fresh = {-1, -1, -1, -1};
  if (rc == SQLITE_OK &&
      evolu_codec_open(path, &db, vfs_name, test_key, kind->flags) ==
          SQLITE_OK)
    fresh = state_of(db);
  sqlite3_close(db);
  snprintf(message, 200,
           "%s: rc %d, same %lld/%lld/%lld, later %lld/%lld, fresh "
           "%lld/%lld/%lld",
           end, rc, same.original, same.updated, same.version, later.original,
           later.updated, fresh.original, fresh.updated, fresh.version);
  return rc == SQLITE_OK && is_before(same) && is_before(later) &&
         is_before(fresh);
}

static void codec_crashes_and_rollbacks_restore_every_layout_and_journal_mode(
    void) {
  CHECK(set_up());
  CHECK(register_crash_vfs());
  char base[512];
  path_of(base, "matrix-base.db");
  for (size_t k = 0; k < sizeof kinds / sizeof kinds[0]; k++) {
    CHECK(create_base(&kinds[k], base));
    for (size_t j = 0; j < sizeof journal_modes / sizeof journal_modes[0];
         j++)
      for (size_t y = 0;
           y < sizeof synchronous_modes / sizeof synchronous_modes[0]; y++) {
        char message[200] = "";
        int ok =
            crashes_roll_back(&kinds[k], journal_modes[j],
                              synchronous_modes[y], base, message) &&
            rollback_restores(&kinds[k], journal_modes[j],
                              synchronous_modes[y], base, "rollback",
                              message) &&
            // Without begin, the savepoint is the transaction, which the
            // release would commit.
            rollback_restores(&kinds[k], journal_modes[j],
                              synchronous_modes[y], base,
                              "rollback; begin; savepoint s; pragma "
                              "user_version = 7; update t set v = 'updated' "
                              "|| id; rollback to s; release s; commit",
                              message);
        if (!ok) {
          char failure[400];
          snprintf(failure, sizeof failure, "%s, %s, %s: %s", kinds[k].name,
                   journal_modes[j], synchronous_modes[y], message);
          test_fail(__FILE__, __LINE__, failure);
          return;
        }
      }
  }
}

/*
 * Crashes a plain UPDATE of a database of kind with pages of page_size at
 * every write over files with sectors of crash_sector_size bytes, and checks
 * each crash leaves the database wholly before or after it. Returns 0 with a
 * message on the first that doesn't.
 */
static int crashes_roll_back_over_sectors(const Kind *kind, int page_size,
                                          char message[200]) {
  char base[512];
  char path[512];
  char copy[512];
  char sql[64];
  path_of(base, "matrix-base.db");
  path_of(path, "matrix-work.db");
  path_of(copy, "matrix-copy.db");
  remove_database(base);
  sqlite3 *db = NULL;
  snprintf(sql, sizeof sql, "pragma page_size = %d", page_size);
  int ok = evolu_codec_open(base, &db, vfs_name, test_key, kind->flags) ==
               SQLITE_OK &&
           sqlite3_exec(db, sql, NULL, NULL, NULL) == SQLITE_OK &&
           create_rows(db, MATRIX_ROWS) == SQLITE_OK;
  if (sqlite3_close(db) != SQLITE_OK || !ok) return 0;
  for (int write = 1;; write++) {
    remove_database(path);
    if (!copy_file(base, path)) return 0;
    crash_writes = 0;
    crash_at = write;
    has_crashed = 0;
    crash_path = path;
    crash_copy = copy;
    db = NULL;
    int rc = evolu_codec_open(path, &db, crash_codec_vfs_name, test_key,
                              kind->flags);
    // Page 1 is journaled last, at the commit, after spills began segments.
    if (rc == SQLITE_OK)
      rc = sqlite3_exec(db,
                        "pragma cache_size = 3; update t set v = 'updated' "
                        "|| id",
                        NULL, NULL, NULL);
    sqlite3_close(db);
    // Fewer writes than that: the update committed after write - 1 crashes.
    if (!has_crashed) return rc == SQLITE_OK && write > 20;
    rc = evolu_codec_open(copy, &db, vfs_name, test_key, kind->flags);
    State state = state_of(db);
    sqlite3_close(db);
    if (rc != SQLITE_OK || state.ok != 1 ||
        !((state.original == MATRIX_ROWS && state.updated == 0) ||
          (state.original == 0 && state.updated == MATRIX_ROWS))) {
      snprintf(message, 200, "%s, %d-byte pages, write %d: open %d", kind->name,
               page_size, write, rc);
      return 0;
    }
  }
}

static void codec_crashes_roll_back_over_4096_byte_sectors(void) {
  CHECK(set_up());
  CHECK(register_crash_vfs());
  static const int page_sizes[] = {1024, 4096, 8192};
  for (size_t k = 0; k < 2; k++)
    for (size_t p = 0; p < sizeof page_sizes / sizeof page_sizes[0]; p++) {
      char message[200] = "";
      crash_sector_size = 4096;
      int ok =
          crashes_roll_back_over_sectors(&kinds[k], page_sizes[p], message);
      crash_sector_size = 0;
      if (!ok) {
        test_fail(__FILE__, __LINE__, message);
        return;
      }
    }
}

/*
 * Crashes roll back over the smallest and largest sectors SQLite takes, 32 and
 * 65536 bytes, as over 4096-byte ones.
 */
static void codec_crashes_roll_back_over_the_smallest_and_largest_sectors(
    void) {
  CHECK(set_up());
  CHECK(register_crash_vfs());
  static const int sector_sizes[] = {32, 65536};
  for (size_t k = 0; k < 2; k++)
    for (size_t s = 0; s < sizeof sector_sizes / sizeof sector_sizes[0]; s++) {
      char message[200] = "";
      crash_sector_size = sector_sizes[s];
      int ok = crashes_roll_back_over_sectors(&kinds[k], 4096, message);
      crash_sector_size = 0;
      if (!ok) {
        test_fail(__FILE__, __LINE__, message);
        return;
      }
    }
}

/*
 * Leaves at stale the journal a transaction, sql, wrote over a copy of the
 * database at from, with its first header zeroed as journal_mode = PERSIST
 * leaves it. Returns whether it could.
 */
static int make_stale_journal(const char *from, int flags, const char *sql,
                              const char *stale) {
  char source[512];
  char source_journal[600];
  path_of(source, "stale-tail-source.db");
  snprintf(source_journal, sizeof source_journal, "%s-journal", source);
  remove_database(source);
  if (!copy_file(from, source)) return 0;
  crash_writes = 0;
  crash_at = 0;
  has_crashed = 0;
  sqlite3 *db = NULL;
  int ok = evolu_codec_open(source, &db, crash_codec_vfs_name, test_key,
                            flags) == SQLITE_OK &&
           sqlite3_exec(db, sql, NULL, NULL, NULL) == SQLITE_OK &&
           copy_file(source_journal, stale);
  sqlite3_close(db);
  remove_database(source);
  return ok && fill_bytes(stale, 0, 28, 0);
}

/*
 * Crashes sql at every write over a copy of the database at base whose
 * journal starts as stale, or as none, over files with 4096-byte sectors, and
 * checks each crash opens wholly before or after it, with no hot journal.
 * Returns 0 with a message on the first that doesn't.
 */
static int crashes_roll_back_over_a_stale_tail(const Kind *kind,
                                               const char *base,
                                               const char *stale,
                                               const char *sql,
                                               char message[200]) {
  char path[512];
  char copy[512];
  char journal[600];
  path_of(path, "stale-tail-work.db");
  path_of(copy, "stale-tail-copy.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  for (int write = 1;; write++) {
    remove_database(path);
    if (!copy_file(base, path) ||
        (stale != NULL && !copy_file(stale, journal)))
      return 0;
    crash_writes = 0;
    crash_at = write;
    has_crashed = 0;
    crash_path = path;
    crash_copy = copy;
    sqlite3 *db = NULL;
    int rc = evolu_codec_open(path, &db, crash_codec_vfs_name, test_key,
                              kind->flags);
    if (rc == SQLITE_OK) rc = sqlite3_exec(db, sql, NULL, NULL, NULL);
    sqlite3_close(db);
    if (!has_crashed) return rc == SQLITE_OK && write > 20;
    rc = evolu_codec_open(copy, &db, vfs_name, test_key, kind->flags);
    State state = state_of(db);
    sqlite3_close(db);
    if (rc != SQLITE_OK || state.ok != 1 ||
        !((state.original == MATRIX_ROWS && state.updated == 0) ||
          (state.original == 0 && state.updated == MATRIX_ROWS)) ||
        has_hot_journal(copy)) {
      snprintf(message, 200, "%s, write %d: open %d, %lld original, %lld "
               "updated", kind->name, write, rc, state.original,
               state.updated);
      return 0;
    }
  }
}

/*
 * A journal kept by journal_mode = PERSIST holds a stale tail past the
 * records of the transaction that crashes over it: the same database's, or
 * another database's with the same key and another salt. With 4096-byte
 * sectors, crashes tear page 1's salt, so the rollback takes it from a
 * journal page-1 record, which must be the one it reaches.
 */
static void codec_crashes_roll_back_over_stale_tails_of_kept_journals(void) {
  CHECK(set_up());
  CHECK(register_crash_vfs());
  char base[512];
  char other[512];
  char stale_same[512];
  char stale_other[512];
  path_of(base, "stale-tail-base.db");
  path_of(other, "stale-tail-other.db");
  path_of(stale_same, "stale-tail-same.journal");
  path_of(stale_other, "stale-tail-other.journal");
  // A plain update journals page 1 last, at the commit; the other journals it
  // first and again after spills began segments.
  static const char *const transactions[] = {
      "pragma journal_mode = persist; %s; pragma cache_size = 3; update t set "
      "v = 'updated' || id",
      "pragma journal_mode = persist; %s; pragma cache_size = 3; begin; pragma "
      "user_version = 7; update t set v = 'updated' || id where id <= 6; "
      "pragma user_version = 8; update t set v = 'updated' || id; commit"};
  crash_sector_size = 4096;
  for (size_t k = 0; k < sizeof kinds / sizeof kinds[0]; k++) {
    int ok = create_base(&kinds[k], base);
    remove_database(other);
    sqlite3 *db = NULL;
    crash_writes = 0;
    crash_at = 0;
    has_crashed = 0;
    // More rows for a longer tail.
    ok = ok &&
         evolu_codec_open(other, &db, crash_codec_vfs_name, test_key,
                          kinds[k].flags) == SQLITE_OK &&
         create_rows(db, 60) == SQLITE_OK;
    sqlite3_close(db);
    ok = ok &&
         make_stale_journal(base, kinds[k].flags,
                            "pragma cache_size = 3; begin; pragma "
                            "user_version = 3; update t set v = 's' || id",
                            stale_same) &&
         make_stale_journal(other, kinds[k].flags,
                            "pragma synchronous = off; pragma cache_size = 3; "
                            "begin; update t set v = 's' || id; pragma "
                            "user_version = 3",
                            stale_other);
    if (!ok) {
      crash_sector_size = 0;
      test_fail(__FILE__, __LINE__, kinds[k].name);
      return;
    }
    const char *stales[] = {NULL, stale_same, stale_other};
    for (size_t s = 0; s < sizeof stales / sizeof stales[0]; s++)
      for (size_t t = 0; t < sizeof transactions / sizeof transactions[0]; t++)
        for (size_t y = 0;
             y < sizeof synchronous_modes / sizeof synchronous_modes[0];
             y++) {
          char sql[512];
          char message[200] = "";
          snprintf(sql, sizeof sql, transactions[t], synchronous_modes[y]);
          if (!crashes_roll_back_over_a_stale_tail(&kinds[k], base, stales[s],
                                                   sql, message)) {
            crash_sector_size = 0;
            test_fail(__FILE__, __LINE__, message);
            return;
          }
        }
  }
  crash_sector_size = 0;
  remove_database(base);
  remove_database(other);
  unlink(stale_same);
  unlink(stale_other);
}

/*
 * Crashes sql, run on a copy of the database at base, at every write, as the
 * crash VFS does, and checks that opening each crash's files passes check,
 * records no failure and leaves no hot journal. Returns 0 with a message on
 * the first that doesn't, and when fewer than min_crashes writes happen.
 */
static int crashes_pass(const char *base, const char *sql,
                        int (*check)(sqlite3 *db), int min_crashes,
                        char message[200]) {
  char path[512];
  char copy[512];
  path_of(path, "crash-work.db");
  path_of(copy, "crash-copy.db");
  int crashes = 0;
  for (int write = 1;; write++) {
    remove_database(path);
    if (!copy_file(base, path)) return 0;
    crash_writes = 0;
    crash_at = write;
    has_crashed = 0;
    crash_path = path;
    crash_copy = copy;
    sqlite3 *db = NULL;
    int rc = evolu_codec_open(path, &db, crash_codec_vfs_name, test_key, 0);
    if (rc == SQLITE_OK) rc = sqlite3_exec(db, sql, NULL, NULL, NULL);
    sqlite3_close(db);
    if (!has_crashed) {
      snprintf(message, 200, "committed with %d after %d crashes", rc,
               crashes);
      return rc == SQLITE_OK && crashes >= min_crashes;
    }
    crashes++;
    rc = evolu_codec_open(copy, &db, vfs_name, test_key, 0);
    int passed = rc == SQLITE_OK && check(db);
    evolu_codec_failure failure = {EVOLU_CODEC_FAILURE_NONE, 0};
    evolu_codec_take_failure(db, &failure);
    sqlite3_close(db);
    if (!passed || failure.type != EVOLU_CODEC_FAILURE_NONE ||
        has_hot_journal(copy)) {
      snprintf(message, 200, "write %d: open %d, failure %d", write, rc,
               failure.type);
      return 0;
    }
  }
}

static int is_whole(sqlite3 *db) {
  return query_int(db, "select count(*) from pragma_integrity_check where "
                       "integrity_check = 'ok'") == 1;
}

/* Before or after deleting the rows past 4 of 40. */
static int has_40_or_4_rows(sqlite3 *db) {
  long long rows = query_int(db, "select count(*) from t");
  return is_whole(db) && (rows == 40 || rows == 4);
}

static int has_20_rows(sqlite3 *db) {
  return is_whole(db) && query_int(db, "select count(*) from t") == 20;
}

/* Before or after updating the 40 rows. */
static int has_40_original_or_updated_rows(sqlite3 *db) {
  long long original =
      query_int(db, "select count(*) from t where v like 'evolu-secret-row%'");
  long long updated =
      query_int(db, "select count(*) from t where v like 'updated%'");
  return is_whole(db) && ((original == 40 && updated == 0) ||
                          (original == 0 && updated == 40));
}

/* Creates the database at path with a setup before 40 rows and sql after. */
static int create_crash_base(const char *path, const char *setup,
                             const char *sql) {
  remove_database(path);
  sqlite3 *db = NULL;
  int ok = open_db(path, test_key, &db) == SQLITE_OK &&
           sqlite3_exec(db, setup, NULL, NULL, NULL) == SQLITE_OK &&
           create_rows(db, 40) == SQLITE_OK &&
           sqlite3_exec(db, sql, NULL, NULL, NULL) == SQLITE_OK;
  return sqlite3_close(db) == SQLITE_OK && ok;
}

static void codec_crashes_roll_back_truncating_commits_vacuums_and_large_pages(
    void) {
  CHECK(set_up());
  CHECK(register_crash_vfs());
  char base[512];
  path_of(base, "crash-base.db");
  char message[200] = "";

  // A commit that truncates the file, as auto_vacuum = full makes it.
  CHECK(create_crash_base(base, "pragma auto_vacuum = full", "select 1"));
  if (!crashes_pass(base,
                    "pragma cache_size = 3; begin; delete from t where id > "
                    "4; commit",
                    has_40_or_4_rows, 10, message)) {
    test_fail(__FILE__, __LINE__, message);
    return;
  }

  // A VACUUM that shrinks the file.
  CHECK(create_crash_base(base, "select 1", "delete from t where id > 20"));
  if (!crashes_pass(base, "vacuum", has_20_rows, 10, message)) {
    test_fail(__FILE__, __LINE__, message);
    return;
  }

  // The largest page size.
  CHECK(create_crash_base(base, "pragma page_size = 65536", "select 1"));
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(base, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "pragma page_size"), 65536);
  CHECK(has_40_original_or_updated_rows(db));
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  if (!crashes_pass(base,
                    "pragma cache_size = 1; begin; update t set v = 'updated' "
                    "|| id; commit",
                    has_40_original_or_updated_rows, 2, message)) {
    test_fail(__FILE__, __LINE__, message);
    return;
  }
}

static void codec_journal_stores_writes_of_another_size_than_its_pages(void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  path_of(path, "journal-size.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "pragma page_size"), 4096);
  CHECK_EQ_INT(sqlite3_exec(db, "begin; update t set v = 'updated'", NULL,
                            NULL, NULL),
               SQLITE_OK);
  sqlite3_file *file = NULL;
  CHECK_EQ_INT(
      sqlite3_file_control(db, "main", SQLITE_FCNTL_JOURNAL_POINTER, &file),
      SQLITE_OK);
  CHECK(file != NULL && file->pMethods != NULL);
  // A super-journal's page number and a 512-byte name, as a path of about 500
  // bytes gives it, which is a page size but not the journal's.
  sqlite3_int64 size;
  CHECK_EQ_INT(file->pMethods->xFileSize(file, &size), SQLITE_OK);
  uint8_t number[4] = {0x7f, 0xff, 0xff, 0xff};
  uint8_t name[512];
  memset(name, 'n', sizeof name);
  CHECK_EQ_INT(file->pMethods->xWrite(file, number, 4, size), SQLITE_OK);
  CHECK_EQ_INT(file->pMethods->xWrite(file, name, (int)sizeof name, size + 4),
               SQLITE_OK);
  size_t journal_size;
  uint8_t *bytes = read_file(journal, &journal_size);
  CHECK(bytes != NULL);
  int is_stored = journal_size == (size_t)size + 4 + sizeof name &&
                  memcmp(bytes + size + 4, name, sizeof name) == 0;
  free(bytes);
  CHECK(is_stored);
  sqlite3_close(db);
}

static void codec_refuses_keying_through_sql(void) {
  CHECK(set_up());
  char path[512], attached[512], sql[1200];
  path_of(path, "key-pragmas.db");
  path_of(attached, "attached.db");
  static const char *const refused[] = {
      "pragma key = 'secret'",       "pragma hexkey = '00'",
      "pragma textkey = 'secret'",   "pragma rekey = 'secret'",
      "pragma hexrekey = '00'",      "pragma textrekey = 'secret'",
      "pragma main.KEY = 'secret'",  "pragma cipher_compatibility = 4",
      "pragma cipher = 'sqlcipher'", "pragma cipher_version"};
  // Plaintext, where SQLite would ignore them and store plaintext, and keyed.
  for (int keyed = 0; keyed < 2; keyed++) {
    remove_database(path);
    remove_database(attached);
    sqlite3 *db = NULL;
    CHECK_EQ_INT(open_db(path, keyed ? test_key : NULL, &db), SQLITE_OK);
    for (size_t i = 0; i < sizeof refused / sizeof refused[0]; i++) {
      evolu_codec_failure failure = {0};
      int rc = sqlite3_exec(db, refused[i], NULL, NULL, NULL);
      if (rc != SQLITE_ERROR ||
          strstr(sqlite3_errmsg(db), "evolu_codec_open") == NULL ||
          evolu_codec_take_failure(db, &failure) != SQLITE_OK ||
          failure.type != EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED) {
        test_fail(__FILE__, __LINE__, refused[i]);
        sqlite3_close(db);
        return;
      }
    }

    // SQLite ignores ATTACH's KEY clause, so an attached database opens
    // read-only, and ATTACH creates no file.
    snprintf(sql, sizeof sql, "attach '%s' as a key 'secret'", attached);
    CHECK_EQ_INT(sqlite3_exec(db, sql, NULL, NULL, NULL), SQLITE_CANTOPEN);
    CHECK(!file_exists(attached));
    CHECK_EQ_INT(create_rows(db, 1), SQLITE_OK);
    snprintf(sql, sizeof sql, "vacuum into '%s'", attached);
    CHECK_EQ_INT(sqlite3_exec(db, sql, NULL, NULL, NULL), SQLITE_OK);
    snprintf(sql, sizeof sql, "attach '%s' as a key 'secret'", attached);
    CHECK_EQ_INT(sqlite3_exec(db, sql, NULL, NULL, NULL), SQLITE_OK);
    CHECK_EQ_INT(query_int(db, "select count(*) from a.t"), 1);
    CHECK_EQ_INT(sqlite3_exec(db, "insert into a.t (v) values ('plaintext')",
                              NULL, NULL, NULL),
                 SQLITE_READONLY);
    CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  }
}

static void codec_page_1_storing_another_page_size_fails_also_with_sqlcipher_files(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "tampered-size.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "pragma page_size"), 4096);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  // Bytes 16 and 17, unauthenticated in the default layout, say 8192.
  CHECK(fill_bytes(path, 16, 1, 0x20));
  CHECK(fill_bytes(path, 17, 1, 0x00));
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_NOTADB);
  sqlite3_close(db);
  CHECK_EQ_INT(evolu_codec_open(path, &db, vfs_name, test_key,
                                EVOLU_CODEC_SQLCIPHER_FILES),
               SQLITE_NOTADB);
  sqlite3_close(db);
}

/*
 * A read that's neither a whole page nor within page 1's first 100 bytes fails
 * before the codec reads anything.
 */
static void codec_refuses_other_reads_before_reading(void) {
  CHECK(set_up());
  CHECK(register_crash_vfs());
  crash_writes = 0;
  crash_at = 0;
  has_crashed = 0;
  char path[512];
  path_of(path, "other-reads.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(evolu_codec_open(path, &db, crash_codec_vfs_name, test_key, 0),
               SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 5), SQLITE_OK);
  int page_size = (int)query_int(db, "pragma page_size");
  sqlite3_file *file = database_file(db);
  CHECK(file != NULL);
  uint8_t buffer[16];
  memset(buffer, 1, sizeof buffer);
  crash_reads = 0;
  CHECK_EQ_INT(file->pMethods->xRead(file, buffer, (int)sizeof buffer,
                                     page_size + 16),
               SQLITE_IOERR_READ);
  CHECK_EQ_INT(crash_reads, 0);
  static const uint8_t zeros[16];
  CHECK_EQ_BYTES(buffer, zeros, sizeof buffer);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_open_refuses_both_flags_and_unknown_flags(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "both-flags.db");
  remove_database(path);
  static const int refused[] = {
      EVOLU_CODEC_SQLCIPHER_FILES | EVOLU_CODEC_PLAINTEXT_CHECKSUMS, 4,
      EVOLU_CODEC_PLAINTEXT_CHECKSUMS | 8, -1};
  for (size_t i = 0; i < sizeof refused / sizeof refused[0]; i++) {
    sqlite3 *db = (sqlite3 *)1;
    CHECK_EQ_INT(evolu_codec_open(path, &db, vfs_name, test_key, refused[i]),
                 SQLITE_MISUSE);
    CHECK(db == NULL);
    CHECK(!file_exists(path));
  }
}

/*
 * Nor does it open on another VFS, also without a key, so no open skips the
 * codec's refusals, such as of an encrypted database's hot journal.
 */
static void codec_open_refuses_a_vfs_that_isnt_a_codec_vfs(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "not-codec-vfs.db");
  remove_database(path);
  const char *const refused[] = {NULL, sqlite3_vfs_find(NULL)->zName,
                                 "no-such-vfs"};
  const uint8_t *const keys[] = {NULL, test_key};
  for (size_t i = 0; i < sizeof refused / sizeof refused[0]; i++)
    for (size_t k = 0; k < sizeof keys / sizeof keys[0]; k++) {
      sqlite3 *db = (sqlite3 *)1;
      CHECK_EQ_INT(evolu_codec_open(path, &db, refused[i], keys[k], 0),
                   SQLITE_MISUSE);
      CHECK(db == NULL);
      CHECK(!file_exists(path));
    }
}

static void codec_proven_key_takes_a_recreated_databases_salt_for_its_hot_journal(
    void) {
  CHECK(set_up());
  char path[512];
  char source[512];
  char journal[600];
  path_of(path, "recreated.db");
  path_of(source, "recreated-source.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  remove_database(path);
  remove_database(source);
  sqlite3 *reader = NULL;
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &reader), SQLITE_OK);
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 200), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  // The reader's page 1 proves the key with the first salt.
  CHECK_EQ_INT(query_int(reader, "select count(*) from t"), 200);

  // The database is created again, with another salt, and its transaction,
  // which journals no page 1, crashes.
  CHECK_EQ_INT(open_db(source, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 200), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK_EQ_INT(crash_over(source, path, test_key,
                          "update t set v = 'updated' || id"),
               SQLITE_OK);

  // Page 1 of the database gives the new salt, although the key is proven.
  CHECK(has_original_rows(reader));
  CHECK(!file_exists(journal));
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(reader, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
  CHECK_EQ_INT(sqlite3_close(reader), SQLITE_OK);
}

static void codec_hot_journal_takes_the_salt_of_page_1_before_a_stale_record(
    void) {
  CHECK(set_up());
  char path[512];
  char source[512];
  char source_journal[600];
  char journal[600];
  char other[512];
  char other_journal[600];
  path_of(path, "stale-salt.db");
  path_of(source, "stale-salt-source.db");
  path_of(other, "stale-salt-other.db");
  snprintf(source_journal, sizeof source_journal, "%s-journal", source);
  snprintf(journal, sizeof journal, "%s-journal", path);
  snprintf(other_journal, sizeof other_journal, "%s-journal", other);

  // Another database's page-1 record, with another salt: the first record of
  // a transaction that journals page 1 first.
  CHECK_EQ_INT(create_crashed_database_with(other, test_key,
                                            "pragma user_version = 7; update "
                                            "t set v = 'updated' || id"),
               SQLITE_OK);
  size_t other_size;
  uint8_t *other_bytes = read_file(other_journal, &other_size);
  CHECK(other_bytes != NULL);
  uint32_t sector_size = (uint32_t)other_bytes[20] << 24 |
                         (uint32_t)other_bytes[21] << 16 |
                         (uint32_t)other_bytes[22] << 8 | other_bytes[23];
  uint32_t page_size = (uint32_t)other_bytes[24] << 24 |
                       (uint32_t)other_bytes[25] << 16 |
                       (uint32_t)other_bytes[26] << 8 | other_bytes[27];
  size_t record_size = (size_t)page_size + 8;
  CHECK(other_bytes[sector_size + 3] == 1 &&
        other_size >= sector_size + record_size);
  uint8_t *stale = malloc(record_size);
  CHECK(stale != NULL);
  memcpy(stale, other_bytes + sector_size, record_size);
  free(other_bytes);

  // A crash of a transaction without synchronous, whose journal counts its
  // records up to its end and journals no page 1, as a journal kept by
  // journal_mode = PERSIST is left with an earlier transaction's records past
  // them.
  remove_database(source);
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(source, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 200), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db,
                            "pragma synchronous = off; pragma cache_size = 10; "
                            "begin; update t set v = 'updated' || id",
                            NULL, NULL, NULL),
               SQLITE_OK);
  CHECK(copy_file(source, path) && copy_file(source_journal, journal));
  sqlite3_close(db);
  size_t size;
  uint8_t *bytes = read_file(journal, &size);
  CHECK(bytes != NULL);
  int counts_to_end = bytes[8] == 0xff && bytes[9] == 0xff &&
                      bytes[10] == 0xff && bytes[11] == 0xff &&
                      (size - sector_size) % record_size == 0;
  uint8_t *longer = realloc(bytes, size + record_size);
  CHECK(longer != NULL);
  memcpy(longer + size, stale, record_size);
  free(stale);
  int written = write_file(journal, longer, size + record_size);
  free(longer);
  CHECK(counts_to_end && written);

  // The database's page 1 gives the salt of the journal's records, so the
  // rollback restores every page and ends at the stale record.
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK(!file_exists(journal));
  CHECK(has_original_rows(db));
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(source);
  remove_database(other);
}

static void codec_part_of_a_page_1_without_a_page_size_is_its_first_100_bytes(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "no-page-size.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 5), SQLITE_OK);
  sqlite3_file *file = database_file(db);
  CHECK(file != NULL);
  // Bytes 16 and 17, unauthenticated, store no page size, so page 1
  // authenticates at none.
  CHECK(fill_bytes(path, 16, 2, 0));
  size_t size;
  uint8_t *stored = read_file(path, &size);
  CHECK(stored != NULL);

  // The reads SQLite makes return the bytes as stored.
  uint8_t buffer[200];
  CHECK_EQ_INT(file->pMethods->xRead(file, buffer, 100, 0), SQLITE_OK);
  int same_header = memcmp(buffer, stored, 100) == 0;
  CHECK_EQ_INT(file->pMethods->xRead(file, buffer, 16, 24), SQLITE_OK);
  int same_counter = memcmp(buffer, stored + 24, 16) == 0;
  free(stored);
  CHECK(same_header && same_counter);
  // Any other part fails, as with a page size, from the 101st byte on.
  memset(buffer, 0xff, sizeof buffer);
  CHECK_EQ_INT(file->pMethods->xRead(file, buffer, 101, 0), SQLITE_IOERR_READ);
  static const uint8_t zeros[101];
  CHECK_EQ_BYTES(buffer, zeros, sizeof zeros);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
  sqlite3_close(db);
}

/*
 * The connection that commits when the reader's walk starts its first
 * statement, once, and the result of its commit.
 */
static sqlite3 *walk_writer;
static int walk_writer_rc;

static int commit_when_walk_starts(unsigned type, void *context,
                                   void *statement, void *sql) {
  (void)type;
  (void)context;
  (void)sql;
  const char *text = sqlite3_sql(statement);
  if (walk_writer != NULL && text != NULL && strstr(text, "l = ?2") != NULL) {
    sqlite3 *writer = walk_writer;
    walk_writer = NULL;
    walk_writer_rc = sqlite3_exec(writer,
                                  "begin; select evolu_skiplist_insert("
                                  "zeroblob(16), x'0200000000000000000000000000"
                                  "0000', 3); commit",
                                  NULL, NULL, NULL);
    if (walk_writer_rc != SQLITE_OK)
      sqlite3_exec(writer, "rollback", NULL, NULL, NULL);
  }
  return 0;
}

static void codec_skiplist_reads_one_snapshot_while_another_connection_writes(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "skiplist-snapshot.db");
  remove_database(path);
  sqlite3 *reader = NULL;
  sqlite3 *writer = NULL;
  CHECK_EQ_INT(evolu_codec_open(path, &reader, vfs_name, NULL, 0), SQLITE_OK);
  CHECK_EQ_INT(evolu_codec_open(path, &writer, vfs_name, NULL, 0), SQLITE_OK);
  // Storage.ts's table, with {1} at level 1, {3} at level 2 and {5} at
  // level 1.
  CHECK_EQ_INT(
      sqlite3_exec(reader,
                   "create table evolu_timestamp (ownerId blob not null, t "
                   "blob not null, h1 integer, h2 integer, c integer, l "
                   "integer not null, primary key (ownerId, t)) strict;"
                   "create index evolu_timestamp_index on evolu_timestamp "
                   "(ownerId, l, t, h1, h2, c); begin;"
                   "select evolu_skiplist_insert(zeroblob(16), "
                   "x'01000000000000000000000000000000', 1);"
                   "select evolu_skiplist_insert(zeroblob(16), "
                   "x'03000000000000000000000000000000', 2);"
                   "select evolu_skiplist_insert(zeroblob(16), "
                   "x'05000000000000000000000000000000', 1); commit",
                   NULL, NULL, NULL),
      SQLITE_OK);
  sqlite3_trace_v2(reader, SQLITE_TRACE_STMT, commit_when_walk_starts, NULL);

  // Outside a transaction, the call's first statement keeps its snapshot, so
  // the writer, which inserts {2} at level 3, can't commit in the middle.
  walk_writer = writer;
  walk_writer_rc = -1;
  long long size =
      query_int(reader, "select evolu_skiplist_size(zeroblob(16))");
  walk_writer = NULL;
  sqlite3_close(writer);
  sqlite3_close(reader);
  CHECK_EQ_INT(walk_writer_rc, SQLITE_BUSY);
  CHECK_EQ_INT(size, 3);
}

/* Creates at path a keyed database with three rows in each of tables t and u. */
static int create_two_tables(const char *path) {
  remove_database(path);
  sqlite3 *db = NULL;
  int ok = open_db(path, test_key, &db) == SQLITE_OK &&
           sqlite3_exec(db,
                        "create table t (id integer primary key, v text);"
                        "create table u (id integer primary key, v text);"
                        "insert into t values (1, 'a'), (2, 'b'), (3, 'c');"
                        "insert into u values (1, 'a'), (2, 'b'), (3, 'c')",
                        NULL, NULL, NULL) == SQLITE_OK;
  return sqlite3_close(db) == SQLITE_OK && ok;
}

/*
 * A rollback reads past its transaction's own records, up to the end of a
 * journal that hasn't counted them yet, where a kept journal can hold another
 * database's page-1 record with the same key. Its salt never replaces the
 * proven one, which page 1, cached by an exclusive lock, would keep using.
 */
static void codec_rollback_keeps_the_salt_past_a_stale_page_1_record(void) {
  CHECK(set_up());
  char path[512];
  char other[512];
  char journal[600];
  path_of(path, "stale-page-1.db");
  path_of(other, "stale-page-1-other.db");
  snprintf(journal, sizeof journal, "%s-journal", path);

  // A kept journal of a transaction that journaled a page of t and page 1.
  CHECK(create_two_tables(path));
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db,
                            "pragma journal_mode = persist; update t set v = "
                            "'x' where id = 1",
                            NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK(file_exists(journal));
  // Another database with the key, and another salt, replaces it.
  CHECK(create_two_tables(other));
  CHECK(copy_file(other, path));

  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db,
                            "pragma locking_mode = exclusive; pragma "
                            "journal_mode = persist; begin; update t set v = "
                            "'y' where id = 1; rollback",
                            NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from u"), 3);
  CHECK_EQ_INT(sqlite3_exec(db, "update t set v = 'z' where id = 2", NULL,
                            NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from u"), 3);
  CHECK_EQ_INT(query_int(db, "select count(*) from pragma_integrity_check "
                             "where integrity_check = 'ok'"),
               1);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(other);
}

/*
 * The same with journal_mode = DELETE: a journal left before its first sync,
 * which isn't hot, holds a page-1 record, and a statement held across the
 * rollback keeps page 1 cached.
 */
static void codec_rollback_keeps_the_salt_past_a_page_1_record_left_unsynced(
    void) {
  CHECK(set_up());
  char path[512];
  char other[512];
  char journal[600];
  char other_journal[600];
  path_of(path, "unsynced-page-1.db");
  path_of(other, "unsynced-page-1-other.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  snprintf(other_journal, sizeof other_journal, "%s-journal", other);

  // The database, and the journal another database with the key, and another
  // salt, left when a transaction that journaled a page of t and then page 1
  // crashed before its first sync.
  CHECK(create_two_tables(path));
  CHECK(create_two_tables(other));
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(other, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db,
                            "begin; update t set v = 'x' where id = 1; pragma "
                            "user_version = 7",
                            NULL, NULL, NULL),
               SQLITE_OK);
  int copied = copy_file(other_journal, journal);
  sqlite3_close(db);
  CHECK(copied);

  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  sqlite3_stmt *held = NULL;
  CHECK_EQ_INT(sqlite3_prepare_v2(db, "select name from sqlite_schema", -1,
                                  &held, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_step(held), SQLITE_ROW);
  CHECK_EQ_INT(sqlite3_exec(db,
                            "begin; update t set v = 'y' where id = 1; "
                            "rollback",
                            NULL, NULL, NULL),
               SQLITE_OK);
  long long rows = query_int(db, "select count(*) from u");
  int rc = sqlite3_exec(db, "update t set v = 'z' where id = 2", NULL, NULL,
                        NULL);
  sqlite3_finalize(held);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK_EQ_INT(rows, 3);
  CHECK_EQ_INT(rc, SQLITE_OK);

  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from u"), 3);
  CHECK_EQ_INT(query_int(db, "select count(*) from pragma_integrity_check "
                             "where integrity_check = 'ok'"),
               1);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(other);
}

/*
 * The connection that creates a database wrote its page 1, which proves its
 * key, so its rollback ends at the stale bytes past its records of a kept
 * journal, which an earlier transaction that spilled into many segments left,
 * as a connection that read page 1 ends there, and its next commit is kept.
 */
static void codec_creating_connection_rolls_back_with_its_key_proven(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "creator.db");
  static const char *const modes[] = {
      "pragma locking_mode = exclusive",
      "pragma locking_mode = exclusive; pragma journal_mode = persist"};
  for (size_t i = 0; i < sizeof modes / sizeof modes[0]; i++) {
    remove_database(path);
    sqlite3 *db = NULL;
    CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
    CHECK_EQ_INT(sqlite3_exec(db, modes[i], NULL, NULL, NULL), SQLITE_OK);
    CHECK_EQ_INT(create_rows(db, 60), SQLITE_OK);
    CHECK_EQ_INT(sqlite3_exec(db,
                              "pragma cache_size = 5; begin; update t set v = "
                              "'a' || v; commit",
                              NULL, NULL, NULL),
                 SQLITE_OK);
    CHECK_EQ_INT(sqlite3_exec(db,
                              "pragma cache_size = 1000; begin; update t set "
                              "v = 'b' || id where id <= 30; rollback",
                              NULL, NULL, NULL),
                 SQLITE_OK);
    evolu_codec_failure failure;
    CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
    CHECK_EQ_INT(sqlite3_exec(db,
                              "begin; update t set v = 'c' || id where id <= "
                              "3; commit",
                              NULL, NULL, NULL),
                 SQLITE_OK);
    CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

    CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
    CHECK_EQ_INT(query_int(db, "select count(*) from t where v like 'c%'"), 3);
    CHECK_EQ_INT(query_int(db, "select count(*) from pragma_integrity_check "
                               "where integrity_check = 'ok'"),
                 1);
    CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  }
}

/*
 * A VFS over the default one whose xOpen of a main database, once armed, has
 * another thread open another keyed database, from start to finish, before it
 * opens the file, as threads opening databases at once can interleave. With
 * is_gate_on_this_thread, it opens that one itself, as an inner VFS's xOpen
 * may, then a plaintext one with sqlite3_open_v2 and again with
 * evolu_codec_open without a key.
 */
static sqlite3_vfs *gate_inner;
static int is_gate_armed;
static int is_gate_on_this_thread;
static char gate_other_path[512];
static int gate_other_rc;
static char gate_plain_path[512];
static int gate_plain_rc;

static void *open_other_database(void *unused) {
  (void)unused;
  sqlite3 *db = NULL;
  int rc = open_db(gate_other_path, other_key, &db);
  if (rc == SQLITE_OK) rc = create_rows(db, 3);
  int closed = sqlite3_close(db);
  gate_other_rc = rc == SQLITE_OK ? closed : rc;
  return NULL;
}

static void open_plain_database(void) {
  sqlite3 *db = NULL;
  int rc = sqlite3_open_v2(gate_plain_path, &db,
                           SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
                           vfs_name);
  if (rc == SQLITE_OK) rc = create_rows(db, 3);
  int closed = sqlite3_close(db);
  if (rc == SQLITE_OK) rc = closed;
  db = NULL;
  if (rc == SQLITE_OK)
    rc = evolu_codec_open(gate_plain_path, &db, vfs_name, NULL, 0);
  if (rc == SQLITE_OK && query_int(db, "select count(*) from t") != 3)
    rc = SQLITE_ERROR;
  closed = sqlite3_close(db);
  gate_plain_rc = rc == SQLITE_OK ? closed : rc;
}

static int gate_open(sqlite3_vfs *vfs, sqlite3_filename name,
                     sqlite3_file *file, int flags, int *out_flags) {
  (void)vfs;
  if (is_gate_armed && (flags & SQLITE_OPEN_MAIN_DB)) {
    is_gate_armed = 0;
    pthread_t thread;
    if (is_gate_on_this_thread) {
      open_other_database(NULL);
      open_plain_database();
    } else if (pthread_create(&thread, NULL, open_other_database, NULL) == 0) {
      pthread_join(thread, NULL);
    }
  }
  return gate_inner->xOpen(gate_inner, name, file, flags, out_flags);
}

static const char gate_vfs_name[] = "evolu-codec-test-gate";
static const char gate_codec_vfs_name[] = "evolu-codec-test-over-gate";

/* Registers the gate VFS and a codec VFS over it, once. */
static int register_gate_vfs(void) {
  static sqlite3_vfs vfs;
  if (sqlite3_vfs_find(gate_vfs_name) == NULL) {
    gate_inner = sqlite3_vfs_find(NULL);
    vfs = *gate_inner;
    vfs.zName = gate_vfs_name;
    vfs.pNext = NULL;
    vfs.xOpen = gate_open;
    if (sqlite3_vfs_register(&vfs, 0) != SQLITE_OK) return 0;
  }
  return evolu_codec_register(gate_codec_vfs_name, gate_vfs_name) == SQLITE_OK;
}

/*
 * The key reaches only the file of the thread that opens with it, whatever
 * another thread opens in the meantime.
 */
static void codec_open_hands_its_key_to_its_own_thread_only(void) {
  CHECK(set_up());
  CHECK(register_gate_vfs());
  char path[512];
  path_of(path, "gated.db");
  path_of(gate_other_path, "gated-other.db");
  remove_database(path);
  remove_database(gate_other_path);
  is_gate_armed = 1;
  gate_other_rc = -1;
  sqlite3 *db = NULL;
  int rc = evolu_codec_open(path, &db, gate_codec_vfs_name, test_key, 0);
  if (rc == SQLITE_OK) rc = create_rows(db, 3);
  sqlite3_close(db);
  CHECK(!is_gate_armed);
  CHECK_EQ_INT(gate_other_rc, SQLITE_OK);
  CHECK_EQ_INT(rc, SQLITE_OK);

  // Each database is encrypted with its own key only.
  CHECK_EQ_INT(open_db(path, other_key, &db), SQLITE_NOTADB);
  sqlite3_close(db);
  CHECK_EQ_INT(open_db(gate_other_path, test_key, &db), SQLITE_NOTADB);
  sqlite3_close(db);
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK_EQ_INT(open_db(gate_other_path, other_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/*
 * Nor do databases that the inner VFS's xOpen opens through a codec VFS on the
 * same thread take the key, or keep it from the file, whether opened with
 * another key or without one.
 */
static void codec_open_keeps_its_key_from_databases_its_inner_vfs_opens(void) {
  CHECK(set_up());
  CHECK(register_gate_vfs());
  char path[512];
  path_of(path, "nested.db");
  path_of(gate_other_path, "nested-other.db");
  path_of(gate_plain_path, "nested-plain.db");
  remove_database(path);
  remove_database(gate_other_path);
  remove_database(gate_plain_path);
  is_gate_armed = 1;
  is_gate_on_this_thread = 1;
  gate_other_rc = -1;
  gate_plain_rc = -1;
  sqlite3 *db = NULL;
  int rc = evolu_codec_open(path, &db, gate_codec_vfs_name, test_key, 0);
  if (rc == SQLITE_OK) rc = create_rows(db, 3);
  sqlite3_close(db);
  is_gate_on_this_thread = 0;
  CHECK(!is_gate_armed);
  CHECK_EQ_INT(gate_plain_rc, SQLITE_OK);
  CHECK_EQ_INT(gate_other_rc, SQLITE_OK);
  CHECK_EQ_INT(rc, SQLITE_OK);

  size_t size;
  uint8_t *bytes = read_file(gate_plain_path, &size);
  int is_plain = bytes != NULL && size >= 16 &&
                 memcmp(bytes, "SQLite format 3", 16) == 0;
  free(bytes);
  CHECK(is_plain);
  bytes = read_file(path, &size);
  int has_plaintext =
      bytes == NULL || contains(bytes, size, "evolu-secret-row", 16);
  free(bytes);
  CHECK(!has_plaintext);
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK_EQ_INT(open_db(gate_other_path, other_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/*
 * A key proven on a file that another key's database then replaced, which
 * takes two keys at once, proves nothing about that database's hot journal: a
 * record it can't authenticate keeps the journal for the other key.
 */
static void codec_proven_key_keeps_another_keys_hot_journal(void) {
  CHECK(set_up());
  char path[512];
  char source[512];
  char journal[600];
  path_of(path, "replaced.db");
  path_of(source, "replaced-source.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  remove_database(path);
  remove_database(source);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);

  // A database with another key crashed in the middle of its transaction,
  // which journals no page 1, and replaced the file in place.
  sqlite3 *other = NULL;
  CHECK_EQ_INT(open_db(source, other_key, &other), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(other, "drop table if exists t", NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(create_rows(other, 200), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(other), SQLITE_OK);
  CHECK_EQ_INT(crash_over(source, path, other_key,
                          "update t set v = 'updated' || id"),
               SQLITE_OK);

  CHECK(sqlite3_exec(db, "select count(*) from sqlite_schema", NULL, NULL,
                     NULL) != SQLITE_OK);
  sqlite3_close(db);
  CHECK(file_exists(journal));
  CHECK_EQ_INT(open_db(path, other_key, &db), SQLITE_OK);
  CHECK(has_original_rows(db));
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/*
 * A hot journal that nothing in it proved, which keeps its records, leaves the
 * journal its connection writes next proven: under locking_mode = EXCLUSIVE
 * that's the same journal file, whose rollback must still end at the stale
 * bytes past its records, so the next commit is kept.
 */
static void codec_journal_written_after_an_unproven_one_is_proven(void) {
  CHECK(set_up());
  char path[512];
  char source[512];
  path_of(path, "unproven-then-own.db");
  path_of(source, "unproven-then-own-source.db");
  remove_database(path);
  remove_database(source);
  sqlite3 *reader = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &reader), SQLITE_OK);
  CHECK_EQ_INT(create_rows(reader, 60), SQLITE_OK);
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  CHECK(bytes != NULL);
  uint8_t salt[16];
  memcpy(salt, bytes, sizeof salt);
  free(bytes);
  CHECK_EQ_INT(sqlite3_exec(reader, "pragma locking_mode = exclusive", NULL,
                            NULL, NULL),
               SQLITE_OK);

  // Another connection's transaction, which journals no page 1, crashed, and
  // page 1's salt was torn, so nothing in the journal authenticates page 1.
  CHECK(copy_file(path, source));
  CHECK_EQ_INT(crash_over(source, path, test_key,
                          "update t set v = 'updated' || id"),
               SQLITE_OK);
  CHECK(fill_bytes(path, 0, 16, 0));
  CHECK_EQ_INT(sqlite3_exec(reader, "select count(*) from t", NULL, NULL, NULL),
               SQLITE_NOTADB);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(reader, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  for (size_t i = 0; i < sizeof salt; i++)
    CHECK(fill_bytes(path, i, 1, salt[i]));
  CHECK_EQ_INT(query_int(reader, "select count(*) from t where v like "
                                 "'evolu-secret-row%'"),
               60);

  // A transaction that spills into many segments, then a rollback of a
  // smaller one, which reads up to the stale bytes past its records.
  CHECK_EQ_INT(sqlite3_exec(reader,
                            "pragma cache_size = 5; begin; update t set v = "
                            "'a' || v; commit",
                            NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(reader,
                            "pragma cache_size = 1000; begin; update t set v = "
                            "'b' || id where id <= 30; rollback",
                            NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(evolu_codec_take_failure(reader, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
  CHECK_EQ_INT(sqlite3_exec(reader,
                            "begin; update t set v = 'c' || id where id <= 3; "
                            "commit",
                            NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(reader), SQLITE_OK);

  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t where v like 'c%'"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_refuses_writes_other_than_whole_pages_and_zero_fills_failed_reads(
    void) {
  CHECK(set_up());
  char path[512];
  char copy[512];
  path_of(path, "partial-writes.db");
  path_of(copy, "partial-writes-copy.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 5), SQLITE_OK);
  int page_size = (int)query_int(db, "pragma page_size");
  CHECK(copy_file(path, copy));
  sqlite3_file *file = database_file(db);
  CHECK(file != NULL);

  static uint8_t page[65536];
  memset(page, 'p', sizeof page);
  struct {
    int amount;
    sqlite3_int64 offset;
  } writes[] = {{16, 0}, {page_size, page_size / 2}};
  for (size_t i = 0; i < sizeof writes / sizeof writes[0]; i++) {
    CHECK_EQ_INT(file->pMethods->xWrite(file, page, writes[i].amount,
                                        writes[i].offset),
                 SQLITE_IOERR_WRITE);
    evolu_codec_failure failure;
    CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
  }
  CHECK(same_files(path, copy));

  // A page that fails to authenticate reads as zeros, never as ciphertext.
  CHECK(flip_bit(path, (size_t)page_size * 2 + 50));
  memset(page, 0xff, sizeof page);
  CHECK_EQ_INT(file->pMethods->xRead(file, page, page_size, page_size * 2),
               SQLITE_CORRUPT);
  static const uint8_t zeros[65536];
  CHECK_EQ_BYTES(page, zeros, (size_t)page_size);
  sqlite3_close(db);
}

/*
 * Every read and write of an encrypted database, a hot journal's rollback
 * included, runs the primitives that handle its key and pages with DIT on,
 * which the runner's build probes.
 */
static void codec_runs_its_crypto_with_dit(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "dit.db");
  evolu_test_dit_missed = 0;
  CHECK_EQ_INT(create_crashed_database(path, test_key), SQLITE_OK);
  evolu_test_dit_missed = 0;
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK(has_original_rows(db));
  CHECK_EQ_INT(sqlite3_exec(db, "update t set v = 'updated' || id", NULL,
                            NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK(!evolu_test_dit_missed);
}

/*
 * A write whose salt or IV the platform's random source fails to give writes
 * nothing and records the failure; the next one, with randomness, works.
 */
static void codec_write_without_randomness_writes_nothing(void) {
  CHECK(set_up());
  char path[512];
  char copy[512];
  path_of(path, "no-random.db");
  path_of(copy, "no-random-copy.db");
  remove_database(path);
  sqlite3 *db = NULL;
  evolu_codec_failure failure;

  // A new database's salt.
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  evolu_test_random_fails = 1;
  int rc = create_rows(db, 3);
  evolu_test_random_fails = 0;
  CHECK_EQ_INT(rc, SQLITE_IOERR_WRITE);
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_RANDOM);
  size_t size = 1;
  uint8_t *bytes = read_file(path, &size);
  free(bytes);
  CHECK_EQ_INT((long long)size, 0);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);

  // A page's IV.
  CHECK(copy_file(path, copy));
  evolu_test_random_fails = 1;
  rc = sqlite3_exec(db, "update t set v = 'updated' || id", NULL, NULL, NULL);
  evolu_test_random_fails = 0;
  CHECK_EQ_INT(rc, SQLITE_IOERR_WRITE);
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_RANDOM);
  CHECK(same_files(path, copy));
  CHECK_EQ_INT(query_int(db, "select count(*) from t where v like "
                             "'evolu-secret-row%'"),
               3);
  CHECK_EQ_INT(sqlite3_exec(db, "update t set v = 'updated' || id", NULL,
                            NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/*
 * The codec's own allocations, the C library's rather than SQLite's, which
 * SQLite's heap limit can't fail. Opening an existing database allocates the
 * page codec and the scratch buffer, which page 1's read takes: each fails the
 * open with SQLITE_NOMEM, records no failure and leaves the database as it
 * was.
 */
static void codec_fails_cleanly_when_its_own_allocations_fail(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "own-allocations.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 20), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  int failed = 0;
  for (int allowed = 0;; allowed++) {
    db = NULL;
    evolu_test_allocations_left = allowed;
    int rc = open_db(path, test_key, &db);
    int is_exhausted = evolu_test_allocations_left < 0;
    evolu_test_allocations_left = -1;
    evolu_codec_failure failure = {EVOLU_CODEC_FAILURE_NONE, 0};
    if (db != NULL) evolu_codec_take_failure(db, &failure);
    sqlite3_close(db);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
    if (!is_exhausted) {
      CHECK_EQ_INT(rc, SQLITE_OK);
      break;
    }
    failed++;
    CHECK_EQ_INT(rc & 0xff, SQLITE_NOMEM);
    CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
    CHECK_EQ_INT(query_int(db, "select count(*) from t"), 20);
    CHECK_EQ_INT(query_int(db, "select count(*) from pragma_integrity_check "
                               "where integrity_check = 'ok'"),
                 1);
    CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  }
  // The page codec's and the scratch buffer's.
  CHECK_EQ_INT(failed, 2);

  // The codec VFS's, which registers nothing, so a retry succeeds.
  evolu_test_allocations_left = 0;
  int rc = evolu_codec_register("evolu-codec-no-memory", NULL);
  evolu_test_allocations_left = -1;
  CHECK_EQ_INT(rc, SQLITE_NOMEM);
  CHECK(sqlite3_vfs_find("evolu-codec-no-memory") == NULL);
  CHECK_EQ_INT(evolu_codec_register("evolu-codec-no-memory", NULL), SQLITE_OK);
  remove_database(path);
}

/*
 * A new database's page 1 allocates nothing, so its first write allocates the
 * scratch buffer: that failure fails the write with SQLITE_NOMEM, records no
 * failure and leaves the database empty, and the connection then writes.
 */
static void codec_fails_cleanly_when_a_new_databases_first_write_cant_allocate(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "own-allocations-new.db");
  int failed_writes = 0;
  for (int allowed = 0;; allowed++) {
    remove_database(path);
    sqlite3 *db = NULL;
    evolu_test_allocations_left = allowed;
    int rc = open_db(path, test_key, &db);
    int is_open = rc == SQLITE_OK;
    if (is_open) rc = create_rows(db, 20);
    int is_exhausted = evolu_test_allocations_left < 0;
    evolu_test_allocations_left = -1;
    evolu_codec_failure failure = {EVOLU_CODEC_FAILURE_NONE, 0};
    if (db != NULL) evolu_codec_take_failure(db, &failure);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
    if (!is_exhausted) {
      CHECK_EQ_INT(rc, SQLITE_OK);
      CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
      break;
    }
    CHECK_EQ_INT(rc & 0xff, SQLITE_NOMEM);
    if (is_open) {
      failed_writes++;
      CHECK_EQ_INT(query_int(db, "select count(*) from sqlite_schema"), 0);
      CHECK_EQ_INT(create_rows(db, 20), SQLITE_OK);
      CHECK_EQ_INT(query_int(db, "select count(*) from t"), 20);
    }
    CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  }
  CHECK_EQ_INT(failed_writes, 1);
  remove_database(path);
}

/*
 * Opening a database with a hot journal checks the journal before SQLite rolls
 * it back, allocating the scratch buffer where page 1's read didn't: with the
 * key when a crash tore page 1's salt, in page 1's decryption, or also its
 * page size, in the walk to the journal's page-1 record, and without it when a
 * crash tore a plaintext page 1. Each failure fails the open with
 * SQLITE_NOMEM, records no failure and leaves the database and its journal
 * byte-identical, and the next open rolls the journal back.
 */
static void codec_fails_cleanly_when_checking_a_hot_journal_cant_allocate(
    void) {
  CHECK(set_up());
  static const struct {
    const uint8_t *key;
    size_t torn;
    int allocations;
  } cases[] = {
      // The page codec's, then the scratch buffer's.
      {test_key, 16, 2},
      {test_key, 18, 2},
      // The scratch buffer's alone.
      {NULL, 16, 1},
  };
  char path[512];
  char journal[600];
  char copy[512];
  char journal_copy[600];
  path_of(path, "own-allocations-hot.db");
  path_of(copy, "own-allocations-hot-copy.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  snprintf(journal_copy, sizeof journal_copy, "%s-journal", copy);
  for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++) {
    const uint8_t *key = cases[i].key;
    CHECK_EQ_INT(create_crashed_database_with(path, key,
                                              "pragma user_version = 7; update "
                                              "t set v = 'updated' || id"),
                 SQLITE_OK);
    CHECK(fill_bytes(path, 0, cases[i].torn, 0));
    CHECK(copy_file(path, copy));
    CHECK(copy_file(journal, journal_copy));
    int failed = 0;
    for (int allowed = 0;; allowed++) {
      sqlite3 *db = NULL;
      evolu_test_allocations_left = allowed;
      int rc = open_db(path, key, &db);
      int is_exhausted = evolu_test_allocations_left < 0;
      evolu_test_allocations_left = -1;
      evolu_codec_failure failure = {EVOLU_CODEC_FAILURE_NONE, 0};
      if (db != NULL) evolu_codec_take_failure(db, &failure);
      sqlite3_close(db);
      CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
      if (!is_exhausted) {
        CHECK_EQ_INT(rc, SQLITE_OK);
        break;
      }
      failed++;
      CHECK_EQ_INT(rc & 0xff, SQLITE_NOMEM);
      CHECK(same_files(path, copy));
      CHECK(same_files(journal, journal_copy));
    }
    CHECK_EQ_INT(failed, cases[i].allocations);

    sqlite3 *db = NULL;
    CHECK_EQ_INT(open_db(path, key, &db), SQLITE_OK);
    CHECK(!file_exists(journal));
    CHECK(has_original_rows(db));
    CHECK_EQ_INT(query_int(db, "pragma user_version"), 0);
    CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  }
  remove_database(path);
  remove_database(copy);
}

/* The codec keeps the first failure it records until it's taken. */
static void codec_keeps_the_first_failure_until_taken(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "first-failure.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  // Page 1 fails to authenticate with another key, then a pragma is refused.
  CHECK_EQ_INT(open_db(path, other_key, &db), SQLITE_NOTADB);
  CHECK_EQ_INT(sqlite3_exec(db, "pragma key = 'x'", NULL, NULL, NULL),
               SQLITE_ERROR);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  CHECK_EQ_INT(failure.page_number, 1);
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
  sqlite3_close(db);
}

static void codec_leaves_the_callers_key_as_it_was(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "caller-key.db");
  remove_database(path);
  uint8_t key[EVOLU_CODEC_KEY_SIZE];
  memcpy(key, test_key, sizeof key);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK_EQ_BYTES(key, test_key, sizeof key);
}

static void codec_open_registers_the_core_functions(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "functions.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select evolu_core_version()"),
               EVOLU_CORE_VERSION);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK_EQ_INT(open_db(":memory:", NULL, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select evolu_core_version()"),
               EVOLU_CORE_VERSION);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_rolls_back_a_hot_journal_that_stores_no_plaintext(void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  path_of(path, "hot.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  CHECK_EQ_INT(create_crashed_database(path, test_key), SQLITE_OK);

  size_t size;
  uint8_t *bytes = read_file(journal, &size);
  CHECK(bytes != NULL && size > 10 * 4096);
  int stores_plaintext = contains(bytes, size, secret, sizeof secret - 1) ||
                         contains(bytes, size, "SQLite format 3", 15);
  free(bytes);
  CHECK(!stores_plaintext);

  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK(!file_exists(journal));
  CHECK_EQ_INT(query_int(db, "select count(*) from t where v like 'evolu-"
                             "secret-row%'"),
               200);
  CHECK_EQ_INT(query_int(db, "select count(*) from pragma_integrity_check "
                             "where integrity_check = 'ok'"),
               1);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_hot_journal_survives_a_wrong_key_and_no_key(void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  char copy[512];
  char journal_copy[512];
  path_of(path, "hot-wrong-key.db");
  path_of(copy, "hot-wrong-key-copy.db");
  path_of(journal_copy, "hot-wrong-key-copy.db-journal");
  snprintf(journal, sizeof journal, "%s-journal", path);
  CHECK_EQ_INT(create_crashed_database(path, test_key), SQLITE_OK);
  CHECK(copy_file(path, copy) && copy_file(journal, journal_copy));

  // A wrong key fails at the journal's first record and keeps the journal.
  sqlite3 *db = NULL;
  int rc = open_db(path, other_key, &db);
  CHECK(rc == SQLITE_NOTADB || rc == SQLITE_CORRUPT);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  sqlite3_close(db);
  CHECK(same_files(journal, journal_copy));

  // Without a key, SQLite would take the first record, whose checksum then
  // differs, as the end of the journal and delete it.
  CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_CANTOPEN);
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
  sqlite3_close(db);
  CHECK(same_files(path, copy));
  CHECK(same_files(journal, journal_copy));

  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK(!file_exists(journal));
  CHECK_EQ_INT(query_int(db, "select count(*) from t where v like 'evolu-"
                             "secret-row%'"),
               200);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/* Keeps the journal, with synchronous = OFF counting its records to its end. */
static const char kept_journal[] = "pragma journal_mode = persist; "
                                   "pragma synchronous = off; "
                                   "pragma cache_size = 10; ";

/*
 * Leaves at crash a database with key whose transaction, sql after begin,
 * crashed over the journal that an earlier database at the same path, with
 * earlier_key, kept: the crash's records come first, and the earlier
 * transaction's follow, page 1 last. With reader, a connection opens crash
 * with earlier_key and proves it on the earlier database before the crash
 * replaces it. Returns the step's result.
 */
static int crash_over_a_kept_journal(const char *crash, int flags,
                                     const uint8_t *earlier_key,
                                     const uint8_t *key, const char *sql,
                                     sqlite3 **reader) {
  char path[512];
  char source[512];
  char path_journal[600];
  char crash_journal[600];
  char statements[512];
  path_of(path, "kept-journal.db");
  path_of(source, "kept-journal-source.db");
  snprintf(path_journal, sizeof path_journal, "%s-journal", path);
  snprintf(crash_journal, sizeof crash_journal, "%s-journal", crash);
  remove_database(path);
  remove_database(source);
  remove_database(crash);
  sqlite3 *db = NULL;
  int rc = evolu_codec_open(path, &db, vfs_name, earlier_key, flags);
  if (rc == SQLITE_OK) rc = create_rows(db, 300);
  snprintf(statements, sizeof statements,
           "%supdate t set v = 'earlier' || id", kept_journal);
  if (rc == SQLITE_OK) rc = sqlite3_exec(db, statements, NULL, NULL, NULL);
  sqlite3_close(db);
  db = NULL;
  if (rc == SQLITE_OK && reader != NULL) {
    if (!copy_file(path, crash)) rc = SQLITE_ERROR;
    if (rc == SQLITE_OK)
      rc = evolu_codec_open(crash, reader, vfs_name, earlier_key, flags);
    if (rc == SQLITE_OK && query_int(*reader, "select count(*) from t") != 300)
      rc = SQLITE_ERROR;
  }
  // A database with another key replaces the file, and the journal stays.
  if (rc == SQLITE_OK)
    rc = evolu_codec_open(source, &db, vfs_name, key, flags);
  if (rc == SQLITE_OK) rc = create_rows(db, 200);
  sqlite3_close(db);
  db = NULL;
  if (rc == SQLITE_OK && !copy_file(source, path)) rc = SQLITE_ERROR;
  if (rc == SQLITE_OK)
    rc = evolu_codec_open(path, &db, vfs_name, key, flags);
  snprintf(statements, sizeof statements, "%sbegin; %s", kept_journal, sql);
  if (rc == SQLITE_OK) rc = sqlite3_exec(db, statements, NULL, NULL, NULL);
  if (rc == SQLITE_OK &&
      !(copy_file(path, crash) && copy_file(path_journal, crash_journal)))
    rc = SQLITE_ERROR;
  sqlite3_close(db);
  remove_database(path);
  remove_database(source);
  return rc;
}

/*
 * The earlier key authenticates the earlier transaction's page-1 record past
 * the crash's records, but playback reaches that record only through the
 * crash's records, which fail with that key. So it can't take the record's
 * salt and prove itself, which would end playback at the crash's first record
 * and delete the hot journal, leaving the transaction half-applied.
 */
static void codec_earlier_key_keeps_the_hot_journal_of_a_replacing_database(
    void) {
  CHECK(set_up());
  typedef struct {
    const char *sql;
    int is_proven;
  } Case;
  static const Case cases[] = {
      // The crash journals no page 1.
      {"update t set v = 'updated' || id", 0},
      // It journals page 1 first.
      {"pragma user_version = 7; update t set v = 'updated' || id", 0},
      // A connection whose key the earlier database proved opens it.
      {"update t set v = 'updated' || id", 1},
  };
  static const int flags[] = {0, EVOLU_CODEC_PLAINTEXT_CHECKSUMS};
  char crash[512];
  char journal[600];
  char journal_copy[600];
  path_of(crash, "kept-journal-crash.db");
  snprintf(journal, sizeof journal, "%s-journal", crash);
  snprintf(journal_copy, sizeof journal_copy, "%s-copy", journal);
  for (size_t f = 0; f < sizeof flags / sizeof flags[0]; f++)
    for (size_t c = 0; c < sizeof cases / sizeof cases[0]; c++) {
      sqlite3 *reader = NULL;
      CHECK_EQ_INT(crash_over_a_kept_journal(
                       crash, flags[f], test_key, other_key, cases[c].sql,
                       cases[c].is_proven ? &reader : NULL),
                   SQLITE_OK);
      CHECK(copy_file(journal, journal_copy));

      sqlite3 *db = reader;
      int rc = reader != NULL
                   ? sqlite3_exec(reader, "select count(*) from t", NULL, NULL,
                                  NULL)
                   : evolu_codec_open(crash, &db, vfs_name, test_key, flags[f]);
      CHECK(rc == SQLITE_CORRUPT || rc == SQLITE_NOTADB);
      evolu_codec_failure failure;
      CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
      CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
      sqlite3_close(db);
      CHECK(same_files(journal, journal_copy));

      CHECK_EQ_INT(evolu_codec_open(crash, &db, vfs_name, other_key, flags[f]),
                   SQLITE_OK);
      CHECK(!file_exists(journal));
      CHECK(has_original_rows(db));
      CHECK_EQ_INT(query_int(db, "pragma user_version"), 0);
      CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
      unlink(journal_copy);
    }
}

/*
 * Reads at path the journal a transaction, statements after begin, left with
 * synchronous = OFF on a database with key, leaving its journal in *journal
 * and its size in *size, and the database's first 16 bytes in salt. Returns
 * the step's result.
 */
static int read_kept_journal(const char *path, const uint8_t *key,
                             const char *create, const char *statements,
                             uint8_t **journal, size_t *size,
                             uint8_t salt[16]) {
  char journal_path[600];
  char sql[512];
  snprintf(journal_path, sizeof journal_path, "%s-journal", path);
  remove_database(path);
  *journal = NULL;
  sqlite3 *db = NULL;
  int rc = evolu_codec_open(path, &db, vfs_name, key,
                            EVOLU_CODEC_PLAINTEXT_CHECKSUMS);
  if (rc == SQLITE_OK && create != NULL)
    rc = sqlite3_exec(db, create, NULL, NULL, NULL);
  snprintf(sql, sizeof sql, "%sbegin; %s", kept_journal, statements);
  if (rc == SQLITE_OK) rc = sqlite3_exec(db, sql, NULL, NULL, NULL);
  if (rc == SQLITE_OK) *journal = read_file(journal_path, size);
  size_t database_size;
  uint8_t *database = read_file(path, &database_size);
  if (rc == SQLITE_OK && (*journal == NULL || database == NULL ||
                          database_size < 16 || *size < 28))
    rc = SQLITE_ERROR;
  if (rc == SQLITE_OK) memcpy(salt, database, 16);
  free(database);
  sqlite3_close(db);
  remove_database(path);
  return rc;
}

/* The sector size a journal's first header stores. */
static uint32_t journal_sector_size(const uint8_t *journal) {
  return (uint32_t)journal[20] << 24 | (uint32_t)journal[21] << 16 |
         (uint32_t)journal[22] << 8 | journal[23];
}

/*
 * A new database's first transaction journals no page, and its journal's
 * header stores an original size of 0. PERSIST with synchronous = OFF leaves
 * an earlier database's records past it, its page 1 first. The rollback skips
 * every record, but the codec reads each first, and a page-1 record's salt
 * mustn't become the codec's, or the emptied database would be created again
 * with the earlier database's salt.
 */
static void codec_rollback_of_a_new_database_takes_no_stale_salt(void) {
  CHECK(set_up());
  char path[512];
  char earlier[512];
  char journal[600];
  path_of(path, "stale-salt-new.db");
  path_of(earlier, "stale-salt-new-earlier.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  char create[256];
  snprintf(create, sizeof create,
           "create table t (id integer primary key, v text);"
           "with recursive n(i) as (select 1 union all select i + 1 from n "
           "where i < 50) insert into t select i, printf('%%.3000c', 'x') "
           "from n");
  uint8_t *stale = NULL;
  size_t stale_size;
  uint8_t earlier_salt[16];
  CHECK_EQ_INT(read_kept_journal(earlier, test_key, create,
                                 "pragma user_version = 7; update t set v = 'u'",
                                 &stale, &stale_size, earlier_salt),
               SQLITE_OK);
  uint32_t sector_size = journal_sector_size(stale);
  CHECK(stale[sector_size + 3] == 1 && stale_size > sector_size);

  // The new database's crashed first transaction.
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(evolu_codec_open(path, &db, vfs_name, test_key,
                                EVOLU_CODEC_PLAINTEXT_CHECKSUMS),
               SQLITE_OK);
  char sql[512];
  snprintf(sql, sizeof sql, "%sbegin; %s", kept_journal, create);
  CHECK_EQ_INT(sqlite3_exec(db, sql, NULL, NULL, NULL), SQLITE_OK);
  size_t size;
  uint8_t *bytes = read_file(journal, &size);
  char crash[512];
  char crash_journal[600];
  path_of(crash, "stale-salt-new-crash.db");
  snprintf(crash_journal, sizeof crash_journal, "%s-journal", crash);
  remove_database(crash);
  CHECK(copy_file(path, crash));
  sqlite3_close(db);
  remove_database(path);
  CHECK(bytes != NULL && size >= sector_size && bytes[16] == 0 &&
        bytes[17] == 0 && bytes[18] == 0 && bytes[19] == 0);
  memcpy(stale, bytes, sector_size);
  free(bytes);
  CHECK(write_file(crash_journal, stale, stale_size));
  free(stale);

  // The stale page-1 record fails, and the rollback, which emptied the
  // database first, keeps the journal.
  CHECK_EQ_INT(evolu_codec_open(crash, &db, vfs_name, test_key,
                                EVOLU_CODEC_PLAINTEXT_CHECKSUMS),
               SQLITE_NOTADB);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  CHECK_EQ_INT(failure.page_number, 1);
  sqlite3_close(db);
  CHECK(file_exists(crash_journal));

  // The next open deletes the journal of the empty database, which gets a
  // salt of its own.
  CHECK_EQ_INT(evolu_codec_open(crash, &db, vfs_name, test_key,
                                EVOLU_CODEC_PLAINTEXT_CHECKSUMS),
               SQLITE_OK);
  CHECK(!file_exists(crash_journal));
  CHECK_EQ_INT(query_int(db, "pragma page_count"), 0);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  bytes = read_file(crash, &size);
  CHECK(bytes != NULL && size >= 16);
  int is_earlier_salt = memcmp(bytes, earlier_salt, 16) == 0;
  free(bytes);
  CHECK(!is_earlier_salt);
  remove_database(crash);
}

/*
 * A transaction that crashed before it journaled a record leaves only its
 * header, and PERSIST with synchronous = OFF leaves an earlier database's
 * records past it, its page 1 first. A wrong key can't take that record's salt
 * either, so it keeps the journal, which the right key then deletes.
 */
static void codec_wrong_key_keeps_a_journal_of_only_stale_records(void) {
  CHECK(set_up());
  char path[512];
  char earlier[512];
  char source[512];
  char source_journal[600];
  char journal[600];
  path_of(path, "only-stale.db");
  path_of(earlier, "only-stale-earlier.db");
  path_of(source, "only-stale-source.db");
  snprintf(source_journal, sizeof source_journal, "%s-journal", source);
  snprintf(journal, sizeof journal, "%s-journal", path);
  uint8_t *stale = NULL;
  size_t stale_size;
  uint8_t salt[16];
  CHECK_EQ_INT(read_kept_journal(earlier, test_key,
                                 "create table t (id integer primary key, v "
                                 "text); insert into t (v) values ('earlier')",
                                 "pragma user_version = 7; update t set v = 'u'",
                                 &stale, &stale_size, salt),
               SQLITE_OK);
  uint32_t sector_size = journal_sector_size(stale);
  CHECK(stale[sector_size + 3] == 1);

  // A database with other_key, and the header its next transaction wrote.
  remove_database(source);
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(evolu_codec_open(source, &db, vfs_name, other_key,
                                EVOLU_CODEC_PLAINTEXT_CHECKSUMS),
               SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 200), SQLITE_OK);
  CHECK(copy_file(source, path));
  char sql[512];
  snprintf(sql, sizeof sql, "%sbegin; update t set v = 'updated' || id",
           kept_journal);
  CHECK_EQ_INT(sqlite3_exec(db, sql, NULL, NULL, NULL), SQLITE_OK);
  size_t size;
  uint8_t *bytes = read_file(source_journal, &size);
  sqlite3_close(db);
  remove_database(source);
  CHECK(bytes != NULL && size >= sector_size);
  memcpy(stale, bytes, sector_size);
  free(bytes);
  CHECK(write_file(journal, stale, stale_size));
  free(stale);

  CHECK(evolu_codec_open(path, &db, vfs_name, test_key,
                         EVOLU_CODEC_PLAINTEXT_CHECKSUMS) != SQLITE_OK);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  sqlite3_close(db);
  CHECK(file_exists(journal));

  CHECK_EQ_INT(evolu_codec_open(path, &db, vfs_name, other_key,
                                EVOLU_CODEC_PLAINTEXT_CHECKSUMS),
               SQLITE_OK);
  CHECK(!file_exists(journal));
  CHECK(has_original_rows(db));
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(path);
}

/*
 * A plaintext database's transaction kept its journal, page 1 last, and an
 * encrypted database replaced the file and crashed over it, so the earlier
 * plaintext page-1 record follows the crash's encrypted records. The rollback
 * stops at the first encrypted record, whose checksum differs, so without a
 * key that page-1 record can't stand for the journal, and the open keeps it.
 */
static void codec_keyless_open_keeps_a_hot_journal_past_a_stale_plaintext_tail(
    void) {
  CHECK(set_up());
  static const int flags[] = {0, EVOLU_CODEC_PLAINTEXT_CHECKSUMS};
  char crash[512];
  char crash_copy[512];
  char journal[600];
  char journal_copy[600];
  path_of(crash, "plaintext-tail.db");
  path_of(crash_copy, "plaintext-tail-copy.db");
  snprintf(journal, sizeof journal, "%s-journal", crash);
  snprintf(journal_copy, sizeof journal_copy, "%s-copy", journal);
  for (size_t f = 0; f < sizeof flags / sizeof flags[0]; f++) {
    CHECK_EQ_INT(crash_over_a_kept_journal(crash, flags[f], NULL, test_key,
                                           "update t set v = 'updated' || id",
                                           NULL),
                 SQLITE_OK);
    CHECK(copy_file(crash, crash_copy) && copy_file(journal, journal_copy));

    sqlite3 *db = NULL;
    CHECK_EQ_INT(evolu_codec_open(crash, &db, vfs_name, NULL, flags[f]),
                 SQLITE_CANTOPEN);
    evolu_codec_failure failure;
    CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
    sqlite3_close(db);
    CHECK(same_files(crash, crash_copy));
    CHECK(same_files(journal, journal_copy));

    CHECK_EQ_INT(evolu_codec_open(crash, &db, vfs_name, test_key, flags[f]),
                 SQLITE_OK);
    CHECK(!file_exists(journal));
    CHECK(has_original_rows(db));
    CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
    remove_database(crash_copy);
    unlink(journal_copy);
  }
}

/* Writes value big-endian over the 4 bytes at offset in the file at path. */
static int write_be32_at(const char *path, size_t offset, uint32_t value) {
  uint8_t bytes[4] = {(uint8_t)(value >> 24), (uint8_t)(value >> 16),
                      (uint8_t)(value >> 8), (uint8_t)value};
  int ok = 1;
  for (size_t i = 0; ok && i < sizeof bytes; i++)
    ok = fill_bytes(path, offset + i, 1, bytes[i]);
  return ok;
}

/* Writes value big-endian over the 4 bytes at at. */
static void put_be32(uint8_t *at, uint32_t value) {
  at[0] = (uint8_t)(value >> 24);
  at[1] = (uint8_t)(value >> 16);
  at[2] = (uint8_t)(value >> 8);
  at[3] = (uint8_t)value;
}

/* The big-endian u32 at offset in the file at path, or 0. */
static uint32_t read_be32_at(const char *path, size_t offset) {
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  uint32_t value = 0;
  if (bytes != NULL && offset + 4 <= size)
    value = (uint32_t)bytes[offset] << 24 | (uint32_t)bytes[offset + 1] << 16 |
            (uint32_t)bytes[offset + 2] << 8 | bytes[offset + 3];
  free(bytes);
  return value;
}

/*
 * A hot journal whose first header counts no record plays none, so the
 * plaintext page-1 record that follows it can't stand for the journal of an
 * encrypted database, which a keyless open then keeps.
 */
static void codec_keyless_open_reads_no_record_past_a_count_of_0(void) {
  CHECK(set_up());
  char path[512];
  char plain[512];
  char journal[600];
  char plain_journal[600];
  char journal_copy[600];
  path_of(path, "count-0.db");
  path_of(plain, "count-0-plain.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  snprintf(plain_journal, sizeof plain_journal, "%s-journal", plain);
  snprintf(journal_copy, sizeof journal_copy, "%s-copy", journal);
  CHECK_EQ_INT(create_crashed_database(path, test_key), SQLITE_OK);
  // A plaintext journal of page 1 first, whose first header then counts none.
  CHECK_EQ_INT(create_crashed_database_with(plain, NULL,
                                            "pragma user_version = 7; update "
                                            "t set v = 'updated' || id"),
               SQLITE_OK);
  uint32_t sector_size = read_be32_at(plain_journal, 20);
  CHECK(read_be32_at(plain_journal, sector_size) == 1);
  CHECK(write_be32_at(plain_journal, 8, 0));
  CHECK(copy_file(plain_journal, journal) && copy_file(journal, journal_copy));
  remove_database(plain);

  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_CANTOPEN);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
  sqlite3_close(db);
  CHECK(same_files(journal, journal_copy));
  remove_database(path);
  unlink(journal_copy);
}

/*
 * The rollback of a plaintext journal whose page-1 record is in a later
 * segment, after spills began new segments, each with its own checksum
 * initializer, restores a page 1 a crash tore.
 */
static void codec_keyless_rollback_restores_page_1_from_a_later_segment(void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  path_of(path, "later-segment.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  CHECK_EQ_INT(create_crashed_database_with(
                   path, NULL,
                   "update t set v = 'updated' || id where id <= 100;"
                   "pragma user_version = 7; update t set v = 'updated' || id"),
               SQLITE_OK);
  CHECK(fill_bytes(path, 0, 16, 0));
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_OK);
  CHECK(!file_exists(journal));
  CHECK(has_original_rows(db));
  CHECK_EQ_INT(query_int(db, "pragma user_version"), 0);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(path);
}

/*
 * The rollback stops at a record numbered 0 or with the lock-byte page, and
 * skips one numbered above the original size without checking its checksum,
 * so a plaintext page-1 record past the first doesn't stand for the journal,
 * and past the second does.
 */
static void codec_keyless_open_stops_where_the_rollback_stops(void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  char journal_copy[600];
  path_of(path, "rollback-stops.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  snprintf(journal_copy, sizeof journal_copy, "%s-copy", journal);
  for (int i = 0; i < 3; i++) {
    CHECK_EQ_INT(create_crashed_database_with(
                     path, NULL,
                     "update t set v = 'updated' || id where id <= 100;"
                     "pragma user_version = 7; update t set v = 'updated' || "
                     "id"),
                 SQLITE_OK);
    CHECK(fill_bytes(path, 0, 16, 0));
    uint32_t sector_size = read_be32_at(journal, 20);
    uint32_t page_size = read_be32_at(journal, 24);
    uint32_t original_size = read_be32_at(journal, 16);
    CHECK(read_be32_at(journal, sector_size) != 1 && original_size > 0);
    uint32_t numbers[] = {0, 0x40000000u / page_size + 1, original_size + 1};
    CHECK(write_be32_at(journal, sector_size, numbers[i]));
    sqlite3 *db = NULL;
    if (i < 2) {
      CHECK(copy_file(journal, journal_copy));
      CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_CANTOPEN);
      sqlite3_close(db);
      CHECK(same_files(journal, journal_copy));
      unlink(journal_copy);
    } else {
      // Playback skips the record, so its page keeps the spilled update.
      CHECK(flip_bit(journal, sector_size + 4 + page_size));
      CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_OK);
      CHECK(!file_exists(journal));
      CHECK_EQ_INT(query_int(db, "select count(*) from pragma_integrity_check "
                                 "where integrity_check = 'ok'"),
                   1);
      CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
    }
    remove_database(path);
  }
}

static void codec_register_is_idempotent_and_needs_the_inner_vfs(void) {
  CHECK(set_up());
  CHECK_EQ_INT(evolu_codec_register(vfs_name, NULL), SQLITE_OK);
  CHECK_EQ_INT(evolu_codec_register("evolu-codec-missing", "no-such-vfs"),
               SQLITE_ERROR);
  CHECK(sqlite3_vfs_find("evolu-codec-missing") == NULL);
  // A name another VFS has, or none.
  CHECK_EQ_INT(evolu_codec_register(sqlite3_vfs_find(NULL)->zName, NULL),
               SQLITE_MISUSE);
  CHECK_EQ_INT(evolu_codec_register(NULL, NULL), SQLITE_MISUSE);
  // A codec VFS over another, whose journals would hold plaintext.
  CHECK_EQ_INT(evolu_codec_register("evolu-codec-stacked", vfs_name),
               SQLITE_MISUSE);
  CHECK(sqlite3_vfs_find("evolu-codec-stacked") == NULL);
  // A name a codec VFS over another inner VFS has.
  CHECK(register_crash_vfs());
  CHECK_EQ_INT(evolu_codec_register(crash_codec_vfs_name, NULL),
               SQLITE_MISUSE);
}

/*
 * A VFS over the crash VFS, which then never crashes, without the methods
 * SQLite lets a VFS omit: xGetLastError, xDelete and its files' xSectorSize,
 * which SQLite reads only for a file that reports no powersafe overwrite.
 */
static sqlite3_io_methods minimal_io_methods;

static int minimal_device_characteristics(sqlite3_file *file) {
  (void)file;
  return 0;
}

static int minimal_open(sqlite3_vfs *vfs, sqlite3_filename name,
                        sqlite3_file *file, int flags, int *out_flags) {
  int rc = crash_open(vfs, name, file, flags, out_flags);
  if (rc == SQLITE_OK) file->pMethods = &minimal_io_methods;
  return rc;
}

static const char minimal_vfs_name[] = "evolu-codec-test-minimal";
static const char minimal_codec_vfs_name[] = "evolu-codec-test-over-minimal";

/* Registers the minimal VFS and a codec VFS over it, once. */
static int register_minimal_vfs(void) {
  if (!register_crash_vfs()) return 0;
  crash_writes = 0;
  crash_at = 0;
  has_crashed = 0;
  static sqlite3_vfs minimal;
  if (sqlite3_vfs_find(minimal_vfs_name) == NULL) {
    minimal_io_methods = crash_io_methods;
    minimal_io_methods.xSectorSize = NULL;
    minimal_io_methods.xDeviceCharacteristics = minimal_device_characteristics;
    minimal = *crash_inner;
    minimal.zName = minimal_vfs_name;
    minimal.pNext = NULL;
    minimal.szOsFile = (int)sizeof(CrashFile) + crash_inner->szOsFile;
    minimal.xOpen = minimal_open;
    minimal.xDelete = NULL;
    minimal.xGetLastError = NULL;
    if (sqlite3_vfs_register(&minimal, 0) != SQLITE_OK) return 0;
  }
  return evolu_codec_register(minimal_codec_vfs_name, minimal_vfs_name) ==
         SQLITE_OK;
}

/*
 * A codec over such a VFS reads each missing method as SQLite does: no error
 * number for a file that can't be opened, a deletion that succeeds, and
 * SQLite's default sector size.
 */
static void codec_inner_vfs_may_lack_optional_methods(void) {
  CHECK(set_up());
  CHECK(register_minimal_vfs());
  char path[512];
  path_of(path, "missing-directory/missing.db");
  sqlite3 *db = NULL;
  CHECK_EQ_INT(
      evolu_codec_open(path, &db, minimal_codec_vfs_name, test_key, 0),
      SQLITE_CANTOPEN);
  CHECK_EQ_INT(sqlite3_system_errno(db), 0);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  // Nothing deletes the journal, so it's kept.
  path_of(path, "minimal.db");
  remove_database(path);
  CHECK_EQ_INT(
      evolu_codec_open(path, &db, minimal_codec_vfs_name, test_key, 0),
      SQLITE_OK);
  sqlite3_file *file = database_file(db);
  CHECK(file != NULL);
  CHECK_EQ_INT(file->pMethods->xSectorSize(file), 4096);
  CHECK_EQ_INT(sqlite3_exec(db, "pragma journal_mode = persist", NULL, NULL,
                            NULL),
               SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  sqlite3_vfs *codec = sqlite3_vfs_find(minimal_codec_vfs_name);
  CHECK_EQ_INT(codec->xDelete(codec, path, 0), SQLITE_OK);
  CHECK(file_exists(path));
  CHECK_EQ_INT(
      evolu_codec_open(path, &db, minimal_codec_vfs_name, test_key, 0),
      SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/* Whether a journal_mode pragma returns mode. */
static int sets_journal_mode(sqlite3 *db, const char *sql, const char *mode) {
  sqlite3_stmt *statement = NULL;
  int is_mode = sqlite3_prepare_v2(db, sql, -1, &statement, NULL) ==
                    SQLITE_OK &&
                sqlite3_step(statement) == SQLITE_ROW &&
                test_strings_equal(
                    (const char *)sqlite3_column_text(statement, 0), mode);
  sqlite3_finalize(statement);
  return is_mode;
}

/*
 * The codec opens no WAL file, so a database on it, encrypted or not, keeps its
 * rollback journal. Without the shared memory WAL needs, SQLite leaves the
 * journal mode as it is, and with locking_mode = EXCLUSIVE, which needs none,
 * the page 1 that would say WAL fails to be written, so no header says WAL.
 */
static void never_switches_to_wal(const uint8_t *key) {
  char path[512];
  char wal[600];
  path_of(path, "never-wal.db");
  snprintf(wal, sizeof wal, "%s-wal", path);
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK(sets_journal_mode(db, "pragma journal_mode = wal", "delete"));
  CHECK_EQ_INT(sqlite3_exec(db,
                            "pragma locking_mode = exclusive; pragma "
                            "journal_mode = wal",
                            NULL, NULL, NULL),
               SQLITE_IOERR_WRITE);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  CHECK(!file_exists(wal));
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  // Bytes 18 and 19, the file format versions, are 1 for a rollback journal
  // and 2 for WAL.
  int is_rollback =
      bytes != NULL && size > 19 && bytes[18] == 1 && bytes[19] == 1;
  free(bytes);
  CHECK(is_rollback);
  CHECK_EQ_INT(open_db(path, key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_database_never_switches_to_wal(void) {
  CHECK(set_up());
  never_switches_to_wal(test_key);
  never_switches_to_wal(NULL);
}

/*
 * Nor does a backup from a WAL database give one a header that says WAL: the
 * page 1 it copies fails to be written, and the database stays as it was.
 */
static void refuses_a_backup_from_a_wal_database(const uint8_t *key) {
  char path[512];
  char source[512];
  path_of(path, "wal-backup.db");
  path_of(source, "wal-backup-source.db");
  remove_database(path);
  remove_database(source);
  sqlite3 *plain = NULL;
  CHECK_EQ_INT(sqlite3_open_v2(source, &plain,
                               SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
                               NULL),
               SQLITE_OK);
  // An encrypted database's reserved bytes, so only WAL can stop the backup.
  int reserved = EVOLU_CODEC_RESERVED_SIZE;
  CHECK_EQ_INT(sqlite3_file_control(plain, "main", SQLITE_FCNTL_RESERVE_BYTES,
                                    &reserved),
               SQLITE_OK);
  CHECK(sets_journal_mode(plain, "pragma journal_mode = wal", "wal"));
  CHECK_EQ_INT(create_rows(plain, 5), SQLITE_OK);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);

  sqlite3_backup *backup = sqlite3_backup_init(db, "main", plain, "main");
  int rc = backup != NULL ? sqlite3_backup_step(backup, -1) : SQLITE_ERROR;
  sqlite3_backup_finish(backup);
  evolu_codec_failure failure = {EVOLU_CODEC_FAILURE_NONE, 0};
  evolu_codec_take_failure(db, &failure);
  long long count = query_int(db, "select count(*) from t");
  int closed =
      sqlite3_close(db) == SQLITE_OK && sqlite3_close(plain) == SQLITE_OK;
  CHECK(closed);
  CHECK_EQ_INT(rc, SQLITE_IOERR_WRITE);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
  CHECK_EQ_INT(count, 3);
  CHECK_EQ_INT(open_db(path, key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

static void codec_database_refuses_a_backup_from_a_wal_database(void) {
  CHECK(set_up());
  refuses_a_backup_from_a_wal_database(test_key);
  refuses_a_backup_from_a_wal_database(NULL);
}

/*
 * A VFS over the default one whose files fail the fault_at-th call, counting
 * from 1, of xRead, xWrite, xTruncate, xSync and xFileSize with that
 * method's I/O error, as a failing disk does, and pass every other call.
 * fault_calls counts them. While fault_flip_at isn't -1, every third read at
 * that offset gets one of its bytes flipped, as a file that changed between
 * reads gives it; fault_flip_reads counts the reads there.
 */
static sqlite3_vfs *fault_inner;
static int fault_at;
static int fault_calls;
static sqlite3_int64 fault_flip_at = -1;
static int fault_flip_reads;

typedef struct {
  sqlite3_file base;
  sqlite3_file *inner;
} FaultFile;

static int faults(void) { return ++fault_calls == fault_at; }

static int fault_read(sqlite3_file *file, void *buffer, int amount,
                      sqlite3_int64 offset) {
  if (faults()) return SQLITE_IOERR_READ;
  sqlite3_file *inner = ((FaultFile *)file)->inner;
  int rc = inner->pMethods->xRead(inner, buffer, amount, offset);
  if (offset == fault_flip_at && ++fault_flip_reads % 3 == 0)
    ((uint8_t *)buffer)[amount / 2] ^= 1;
  return rc;
}

static int fault_write(sqlite3_file *file, const void *buffer, int amount,
                       sqlite3_int64 offset) {
  if (faults()) return SQLITE_IOERR_WRITE;
  sqlite3_file *inner = ((FaultFile *)file)->inner;
  return inner->pMethods->xWrite(inner, buffer, amount, offset);
}

static int fault_truncate(sqlite3_file *file, sqlite3_int64 size) {
  if (faults()) return SQLITE_IOERR_TRUNCATE;
  sqlite3_file *inner = ((FaultFile *)file)->inner;
  return inner->pMethods->xTruncate(inner, size);
}

static int fault_sync(sqlite3_file *file, int flags) {
  if (faults()) return SQLITE_IOERR_FSYNC;
  sqlite3_file *inner = ((FaultFile *)file)->inner;
  return inner->pMethods->xSync(inner, flags);
}

static int fault_file_size(sqlite3_file *file, sqlite3_int64 *size) {
  if (faults()) return SQLITE_IOERR_FSTAT;
  sqlite3_file *inner = ((FaultFile *)file)->inner;
  return inner->pMethods->xFileSize(inner, size);
}

#define FAULT_FORWARD(name, parameters, arguments)                             \
  static int fault_##name parameters {                                         \
    sqlite3_file *inner = ((FaultFile *)file)->inner;                          \
    return inner->pMethods->x##name arguments;                                 \
  }

FAULT_FORWARD(Close, (sqlite3_file * file), (inner))
FAULT_FORWARD(Lock, (sqlite3_file * file, int level), (inner, level))
FAULT_FORWARD(Unlock, (sqlite3_file * file, int level), (inner, level))
FAULT_FORWARD(CheckReservedLock, (sqlite3_file * file, int *result),
              (inner, result))
FAULT_FORWARD(FileControl, (sqlite3_file * file, int op, void *arg),
              (inner, op, arg))
FAULT_FORWARD(SectorSize, (sqlite3_file * file), (inner))
FAULT_FORWARD(DeviceCharacteristics, (sqlite3_file * file), (inner))

static const sqlite3_io_methods fault_io_methods = {
    1,
    fault_Close,
    fault_read,
    fault_write,
    fault_truncate,
    fault_sync,
    fault_file_size,
    fault_Lock,
    fault_Unlock,
    fault_CheckReservedLock,
    fault_FileControl,
    fault_SectorSize,
    fault_DeviceCharacteristics,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
};

static int fault_open(sqlite3_vfs *vfs, sqlite3_filename name,
                      sqlite3_file *file, int flags, int *out_flags) {
  (void)vfs;
  FaultFile *fault_file = (FaultFile *)file;
  fault_file->inner = (sqlite3_file *)(fault_file + 1);
  int rc = fault_inner->xOpen(fault_inner, name, fault_file->inner, flags,
                              out_flags);
  if (rc != SQLITE_OK) {
    if (fault_file->inner->pMethods != NULL)
      fault_file->inner->pMethods->xClose(fault_file->inner);
    fault_file->base.pMethods = NULL;
    return rc;
  }
  fault_file->base.pMethods = &fault_io_methods;
  return SQLITE_OK;
}

static const char fault_vfs_name[] = "evolu-codec-test-fault";
static const char fault_codec_vfs_name[] = "evolu-codec-test-over-fault";

/* Registers the fault VFS and a codec VFS over it, once. */
static int register_fault_vfs(void) {
  static sqlite3_vfs vfs;
  if (sqlite3_vfs_find(fault_vfs_name) == NULL) {
    fault_inner = sqlite3_vfs_find(NULL);
    vfs = *fault_inner;
    vfs.zName = fault_vfs_name;
    vfs.pNext = NULL;
    vfs.szOsFile = (int)sizeof(FaultFile) + fault_inner->szOsFile;
    vfs.xOpen = fault_open;
    if (sqlite3_vfs_register(&vfs, 0) != SQLITE_OK) return 0;
  }
  return evolu_codec_register(fault_codec_vfs_name, fault_vfs_name) ==
         SQLITE_OK;
}

/* Copies the database at from and its journal, when it has one, to to. */
static int copy_database(const char *from, const char *to) {
  char from_journal[600];
  char to_journal[600];
  snprintf(from_journal, sizeof from_journal, "%s-journal", from);
  snprintf(to_journal, sizeof to_journal, "%s-journal", to);
  remove_database(to);
  return copy_file(from, to) &&
         (!file_exists(from_journal) || copy_file(from_journal, to_journal));
}

/*
 * A hot journal whose page-1 record the check reads again as other bytes, as
 * when the journal changed in between, gives no salt: the proven key then
 * keeps the journal rather than ending its rollback at that record, and a
 * later read rolls it back.
 */
static void codec_hot_journal_check_keeps_a_journal_whose_page_1_record_changed(
    void) {
  CHECK(set_up());
  CHECK(register_fault_vfs());
  fault_at = 0;
  char path[512];
  char source[512];
  char journal[600];
  path_of(path, "changed-record.db");
  path_of(source, "changed-record-source.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  remove_database(path);
  remove_database(source);
  sqlite3 *reader = NULL;
  sqlite3 *db = NULL;
  CHECK_EQ_INT(
      evolu_codec_open(path, &reader, fault_codec_vfs_name, test_key, 0),
      SQLITE_OK);
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 200), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  // The reader's page 1 proves the key with the first salt.
  CHECK_EQ_INT(query_int(reader, "select count(*) from t"), 200);

  // The database is created again, with another salt, its transaction, which
  // journals page 1 first, crashes, and page 1's salt is torn.
  CHECK_EQ_INT(open_db(source, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 200), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK_EQ_INT(crash_over(source, path, test_key,
                          "pragma user_version = 7; "
                          "update t set v = 'updated' || id"),
               SQLITE_OK);
  CHECK(fill_bytes(path, 0, 16, 0));

  // SQLite opens the journal to see whether it's hot and again to roll it
  // back, and each check reads the page-1 record in its two walks and then
  // again, so every third read there is a check's last.
  fault_flip_at = read_be32_at(journal, 20) + 4;
  fault_flip_reads = 0;
  long long rows = query_int(reader, "select count(*) from t");
  fault_flip_at = -1;
  CHECK_EQ_INT(rows, -1);
  CHECK(file_exists(journal));
  CHECK(has_original_rows(reader));
  CHECK(!file_exists(journal));
  CHECK_EQ_INT(sqlite3_close(reader), SQLITE_OK);
  remove_database(path);
}

#define FAULT_ROWS 20

/*
 * Creates at path a database of FAULT_ROWS rows, with the hot journal of a
 * transaction that changed page 1 and spilled updated rows when is_hot, and
 * with its first torn bytes zeros. Returns 0 when a step fails.
 */
static int create_fault_base(const char *path, const uint8_t *key, int is_hot,
                             size_t torn) {
  char source[512];
  char source_journal[600];
  char journal[600];
  snprintf(source, sizeof source, "%s-source", path);
  snprintf(source_journal, sizeof source_journal, "%s-journal", source);
  snprintf(journal, sizeof journal, "%s-journal", path);
  remove_database(source);
  remove_database(path);
  sqlite3 *db = NULL;
  int ok = open_db(source, key, &db) == SQLITE_OK &&
           create_rows(db, FAULT_ROWS) == SQLITE_OK;
  // The smallest cache spills updated pages into the database.
  if (ok && is_hot)
    ok = sqlite3_exec(db,
                      "pragma cache_size = 10; begin; pragma user_version = 7; "
                      "update t set v = 'updated' || id",
                      NULL, NULL, NULL) == SQLITE_OK &&
         copy_file(source_journal, journal);
  ok = ok && copy_file(source, path) &&
       (torn == 0 || fill_bytes(path, 0, torn, 0));
  sqlite3_close(db);
  remove_database(source);
  return ok;
}

/*
 * Whether the database at path, opened without faults, is whole and holds
 * its rows as they were, or as the update after the faults wrote them.
 */
static int is_before_or_after_faults(const char *path, const uint8_t *key) {
  sqlite3 *db = NULL;
  int ok =
      open_db(path, key, &db) == SQLITE_OK &&
      query_int(db, "select count(*) from pragma_integrity_check where "
                    "integrity_check = 'ok'") == 1 &&
      query_int(db, "pragma user_version") == 0 &&
      (query_int(db,
                 "select count(*) from t where v like 'evolu-secret-row%'") ==
           FAULT_ROWS ||
       query_int(db, "select count(*) from t where v like 'faulted%'") ==
           FAULT_ROWS);
  sqlite3_close(db);
  return ok;
}

/*
 * Every call of the inner VFS's files that can fail does, one at a time,
 * while a connection opens a database, which rolls back its hot journal when
 * it has one, reads it whole and updates every row: the open, the read or the
 * update fails or succeeds, and the database, opened again without the
 * failure, is whole, as it was or as the update wrote it. A failure that
 * SQLite doesn't tolerate comes back as an I/O error, or as SQLITE_CANTOPEN
 * from the check of a hot journal, and never as a codec failure, which would
 * say the key is wrong or a page was altered. Hot journals of an intact page
 * 1, of a page 1 a crash tore the salt of, or also its page size, which only
 * the journal's page-1 record gives, and of a plaintext database whose torn
 * page 1 the journal restores.
 */
static void codec_fails_cleanly_whichever_inner_call_fails(void) {
  CHECK(set_up());
  CHECK(register_fault_vfs());
  static const struct {
    const uint8_t *key;
    size_t torn;
    int is_hot;
  } cases[] = {
      {test_key, 0, 0}, {test_key, 0, 1},  {test_key, 16, 1},
      {test_key, 18, 1}, {NULL, 0, 0},     {NULL, 16, 1},
  };
  char base[512];
  char path[512];
  path_of(base, "fault-base.db");
  path_of(path, "fault.db");
  for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++) {
    const uint8_t *key = cases[i].key;
    CHECK(create_fault_base(base, key, cases[i].is_hot, cases[i].torn));
    int failures = 0;
    for (int at = 1;; at++) {
      CHECK(copy_database(base, path));
      fault_calls = 0;
      fault_at = at;
      sqlite3 *db = NULL;
      int rc = evolu_codec_open(path, &db, fault_codec_vfs_name, key, 0);
      if (rc == SQLITE_OK)
        rc = sqlite3_exec(db,
                          "select count(*) from t where v like 'x%'; update t "
                          "set v = 'faulted' || id",
                          NULL, NULL, NULL);
      evolu_codec_failure failure = {EVOLU_CODEC_FAILURE_NONE, 0};
      if (db != NULL) evolu_codec_take_failure(db, &failure);
      int closed = sqlite3_close(db);
      int is_reached = fault_calls >= at;
      fault_at = 0;
      if (!is_reached) {
        CHECK_EQ_INT(rc, SQLITE_OK);
        CHECK_EQ_INT(closed, SQLITE_OK);
        break;
      }
      failures++;
      if (!(rc == SQLITE_OK || (rc & 0xff) == SQLITE_IOERR ||
            rc == SQLITE_CANTOPEN) ||
          failure.type != EVOLU_CODEC_FAILURE_NONE ||
          !is_before_or_after_faults(path, key)) {
        char message[128];
        snprintf(message, sizeof message, "case %zu, call %d: %d, failure %d",
                 i, at, rc, failure.type);
        test_fail(__FILE__, __LINE__, message);
        return;
      }
    }
    CHECK(failures > 0);
  }
  remove_database(base);
  remove_database(path);
}

/*
 * A connection opened while the database was empty reads page 1 whole at
 * SQLite's default page size, then decrypts it at its own: each call of the
 * inner file's that fails meanwhile fails the read, never as a codec failure,
 * and the next one reads. SQLite reports some of those failures as
 * SQLITE_ERROR, since a schema it can't read has no table t.
 */
static void codec_reader_of_another_page_size_fails_cleanly_when_a_read_fails(
    void) {
  CHECK(set_up());
  CHECK(register_fault_vfs());
  char path[512];
  path_of(path, "empty-open-faults.db");
  int failures = 0;
  for (int at = 1;; at++) {
    remove_database(path);
    sqlite3 *reader = NULL;
    sqlite3 *writer = NULL;
    CHECK_EQ_INT(
        evolu_codec_open(path, &reader, fault_codec_vfs_name, test_key, 0),
        SQLITE_OK);
    CHECK_EQ_INT(open_db(path, test_key, &writer), SQLITE_OK);
    CHECK_EQ_INT(sqlite3_exec(writer, "pragma page_size = 16384", NULL, NULL,
                              NULL),
                 SQLITE_OK);
    CHECK_EQ_INT(create_rows(writer, 5), SQLITE_OK);
    CHECK_EQ_INT(sqlite3_close(writer), SQLITE_OK);
    fault_calls = 0;
    fault_at = at;
    long long rows = query_int(reader, "select count(*) from t");
    int is_reached = fault_calls >= at;
    fault_at = 0;
    evolu_codec_failure failure;
    CHECK_EQ_INT(evolu_codec_take_failure(reader, &failure), SQLITE_OK);
    long long rows_after = query_int(reader, "select count(*) from t");
    CHECK_EQ_INT(sqlite3_close(reader), SQLITE_OK);
    CHECK_EQ_INT(rows_after, 5);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
    if (!is_reached) {
      CHECK_EQ_INT(rows, 5);
      break;
    }
    failures++;
    CHECK_EQ_INT(rows, -1);
  }
  CHECK(failures > 0);
  remove_database(path);
}

/*
 * Opening a database, with SQLite's allocations failing from the n-th on for
 * every n until one opens whole, fails with SQLITE_NOMEM and leaves the
 * database as it was, whether it's new, existing, plaintext or with a hot
 * journal. So do the refusals of the pragmas, whose messages SQLite
 * allocates.
 */
static void codec_fails_cleanly_when_sqlite_cant_allocate(void) {
  CHECK(set_up());
  static const struct {
    const uint8_t *key;
    int is_new;
    int is_hot;
  } cases[] = {
      {test_key, 1, 0}, {test_key, 0, 0}, {NULL, 0, 0}, {test_key, 0, 1}};
  char base[512];
  char path[512];
  path_of(base, "sqlite-allocations-base.db");
  path_of(path, "sqlite-allocations.db");
  for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++) {
    const uint8_t *key = cases[i].key;
    remove_database(base);
    if (!cases[i].is_new)
      CHECK(create_fault_base(base, key, cases[i].is_hot, 0));
    for (int allowed = 0;; allowed++) {
      if (cases[i].is_new) remove_database(path);
      else CHECK(copy_database(base, path));
      sqlite3 *db = NULL;
      test_sqlite_allocations_left = allowed;
      int rc = open_db(path, key, &db);
      int is_exhausted = test_sqlite_allocations_left == -2;
      test_sqlite_allocations_left = -1;
      sqlite3_close(db);
      if (!is_exhausted) {
        CHECK_EQ_INT(rc, SQLITE_OK);
        break;
      }
      if ((rc & 0xff) != SQLITE_NOMEM ||
          (!cases[i].is_new && !is_before_or_after_faults(path, key))) {
        char message[128];
        snprintf(message, sizeof message, "case %zu, allocation %d: %d", i,
                 allowed, rc);
        test_fail(__FILE__, __LINE__, message);
        return;
      }
    }
  }

  static const char *const refused[] = {"pragma key = 'x'",
                                        "pragma secure_delete = off"};
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  for (size_t i = 0; i < sizeof refused / sizeof refused[0]; i++)
    for (int allowed = 0;; allowed++) {
      test_sqlite_allocations_left = allowed;
      int rc = sqlite3_exec(db, refused[i], NULL, NULL, NULL);
      int is_exhausted = test_sqlite_allocations_left == -2;
      test_sqlite_allocations_left = -1;
      if (!is_exhausted) {
        CHECK_EQ_INT(rc, SQLITE_ERROR);
        break;
      }
      CHECK_EQ_INT(rc, SQLITE_NOMEM);
    }
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(base);
  remove_database(path);
}

/*
 * The codec refuses reads and writes SQLite never makes: of a whole page at a
 * negative offset or past page 4294967295, where no page is, including the
 * offsets whose page number, cut to 32 bits, would be page 4294967295 or page
 * 1, and reads of part of page 1 past its first 100 bytes. A read of a whole
 * page past the end of the file reads zeros, short, as SQLite expects of a
 * file.
 */
static void
codec_refuses_reads_and_writes_where_no_page_is_and_reads_zeros_past_the_end(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "no-page.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  int page_size = (int)query_int(db, "pragma page_size");
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  char copy[512];
  path_of(copy, "no-page-copy.db");
  CHECK(copy_file(path, copy));
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  sqlite3_file *file = database_file(db);
  static uint8_t page[65536];
  static const uint8_t zeros[65536];
  const struct {
    int amount;
    sqlite3_int64 offset;
  } refused[] = {{page_size, -page_size},
                 {page_size, -2 * (sqlite3_int64)page_size},
                 {page_size, (sqlite3_int64)0xffffffff * page_size},
                 {page_size, (sqlite3_int64)0x100000000 * page_size},
                 {20, 90}};
  for (size_t i = 0; i < sizeof refused / sizeof refused[0]; i++) {
    memset(page, 1, sizeof page);
    CHECK_EQ_INT(file->pMethods->xRead(file, page, refused[i].amount,
                                       refused[i].offset),
                 SQLITE_IOERR_READ);
    CHECK_EQ_BYTES(page, zeros, (size_t)refused[i].amount);
    evolu_codec_failure failure;
    CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
    if (refused[i].amount != page_size) continue;
    CHECK_EQ_INT(file->pMethods->xWrite(file, page, page_size,
                                        refused[i].offset),
                 SQLITE_IOERR_WRITE);
    CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
  }
  CHECK(same_files(path, copy));
  memset(page, 1, sizeof page);
  CHECK_EQ_INT(file->pMethods->xRead(file, page, page_size,
                                     (sqlite3_int64)page_size * 1000),
               SQLITE_IOERR_SHORT_READ);
  CHECK_EQ_BYTES(page, zeros, (size_t)page_size);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(path);
  remove_database(copy);
}

/*
 * A page 1 whose write format version, byte 19, isn't 1, as for WAL, is
 * refused like one whose read format version, byte 18, isn't.
 */
static void codec_refuses_page_1_with_a_write_format_version_other_than_1(
    void) {
  CHECK(set_up());
  char path[512];
  char copy[512];
  path_of(path, "write-version.db");
  path_of(copy, "write-version-copy.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  int page_size = (int)query_int(db, "pragma page_size");
  CHECK(copy_file(path, copy));
  sqlite3_file *file = database_file(db);
  static uint8_t page[65536];
  CHECK_EQ_INT(file->pMethods->xRead(file, page, page_size, 0), SQLITE_OK);
  CHECK_EQ_INT(page[18], 1);
  page[19] = 2;
  CHECK_EQ_INT(file->pMethods->xWrite(file, page, page_size, 0),
               SQLITE_IOERR_WRITE);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
  CHECK(same_files(path, copy));
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(path);
  remove_database(copy);
}

/*
 * An open that fails, as in a missing directory, still gives the connection,
 * which the caller closes, but SQLite opened no database file for it, so it
 * has no failure to take, keyed or not.
 */
static void codec_failed_open_has_no_failure_to_take(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "missing-directory/missing.db");
  const uint8_t *const keys[] = {test_key, NULL};
  for (size_t i = 0; i < sizeof keys / sizeof keys[0]; i++) {
    sqlite3 *db = NULL;
    int rc = open_db(path, keys[i], &db);
    evolu_codec_failure failure;
    int taken = db == NULL ? -1 : evolu_codec_take_failure(db, &failure);
    int closed = sqlite3_close(db);
    CHECK_EQ_INT(rc, SQLITE_CANTOPEN);
    CHECK_EQ_INT(taken, SQLITE_NOTFOUND);
    CHECK_EQ_INT(closed, SQLITE_OK);
  }
}

/* Only a connection a codec VFS opened has failures to take. */
static void codec_take_failure_needs_a_codec_connection(void) {
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(NULL, &failure), SQLITE_MISUSE);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(sqlite3_open_v2(":memory:", &db, SQLITE_OPEN_READWRITE, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_NOTFOUND);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/*
 * A VFS over the default one that reports a time, as an inner VFS of
 * iVersion 1, or of iVersion 2 without xCurrentTimeInt64, does, and counts
 * its sleeps. The iVersion 1 one has an xCurrentTimeInt64, which only a
 * caller that ignores iVersion calls, so it counts its calls too.
 */
static double clock_days;
static int clock_int64_calls;
static int clock_sleeps;

static int clock_current_time(sqlite3_vfs *vfs, double *now) {
  (void)vfs;
  *now = clock_days;
  return SQLITE_OK;
}

static int clock_current_time_int64(sqlite3_vfs *vfs, sqlite3_int64 *now) {
  (void)vfs;
  (void)now;
  clock_int64_calls++;
  return SQLITE_ERROR;
}

static int clock_sleep(sqlite3_vfs *vfs, int microseconds) {
  (void)vfs;
  clock_sleeps++;
  sqlite3_vfs *inner = sqlite3_vfs_find(NULL);
  return inner->xSleep(inner, microseconds);
}

/*
 * The codec VFS forwards to its inner VFS what SQLite asks of a VFS: the
 * time, which SQLite reads through the connection's VFS for 'now', from an
 * inner VFS without xCurrentTimeInt64 too, whose days out of a 64-bit
 * millisecond count's range give 0; the sleep of a busy timeout; and the
 * randomness and the time as a Julian day, which SQLite asks only of the
 * default VFS.
 */
static void codec_vfs_forwards_time_sleep_and_randomness(void) {
  CHECK(set_up());
  static sqlite3_vfs clocks[2];
  static const char clock_names[2][40] = {"evolu-codec-test-clock-1",
                                          "evolu-codec-test-clock-2"};
  static const char clock_codec_vfs_names[2][40] = {
      "evolu-codec-test-over-clock-1", "evolu-codec-test-over-clock-2"};
  for (int i = 0; i < 2; i++) {
    if (sqlite3_vfs_find(clock_names[i]) == NULL) {
      clocks[i] = *sqlite3_vfs_find(NULL);
      clocks[i].zName = clock_names[i];
      clocks[i].pNext = NULL;
      clocks[i].iVersion = i + 1;
      clocks[i].xCurrentTime = clock_current_time;
      clocks[i].xCurrentTimeInt64 = i == 0 ? clock_current_time_int64 : NULL;
      clocks[i].xSleep = clock_sleep;
      CHECK_EQ_INT(sqlite3_vfs_register(&clocks[i], 0), SQLITE_OK);
    }
    CHECK_EQ_INT(evolu_codec_register(clock_codec_vfs_names[i], clock_names[i]),
                 SQLITE_OK);
    sqlite3_vfs *codec = sqlite3_vfs_find(clock_codec_vfs_names[i]);
    // 2000-01-01, then days past what a 64-bit millisecond count holds.
    static const struct {
      double days;
      sqlite3_int64 milliseconds;
    } times[] = {{2451544.5, 211813444800000LL}, {1e300, 0}, {-1e300, 0}};
    clock_int64_calls = 0;
    for (size_t j = 0; j < sizeof times / sizeof times[0]; j++) {
      clock_days = times[j].days;
      sqlite3_int64 now = -1;
      CHECK_EQ_INT(codec->xCurrentTimeInt64(codec, &now), SQLITE_OK);
      CHECK_EQ_INT(now, times[j].milliseconds);
    }
    CHECK_EQ_INT(clock_int64_calls, 0);
  }

  char path[512];
  path_of(path, "vfs-methods.db");
  remove_database(path);
  sqlite3 *db = NULL;
  sqlite3 *other = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  long long seconds = query_int(db, "select unixepoch()");
  CHECK(seconds >= (long long)time(NULL) - 1 &&
        seconds <= (long long)time(NULL) + 1);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  // Through the codec over a clock, whose sleeps are counted.
  CHECK_EQ_INT(evolu_codec_open(path, &db, clock_codec_vfs_names[1], test_key,
                                0),
               SQLITE_OK);
  CHECK_EQ_INT(evolu_codec_open(path, &other, clock_codec_vfs_names[1],
                                test_key, 0),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(other, "begin exclusive", NULL, NULL, NULL),
               SQLITE_OK);
  sqlite3_busy_timeout(db, 5);
  clock_sleeps = 0;
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), -1);
  CHECK_EQ_INT(sqlite3_errcode(db), SQLITE_BUSY);
  CHECK(clock_sleeps > 0);
  CHECK_EQ_INT(sqlite3_close(other), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(path);

  sqlite3_vfs *codec = sqlite3_vfs_find(vfs_name);
  uint8_t random[32] = {0};
  CHECK_EQ_INT(codec->xRandomness(codec, (int)sizeof random, (char *)random),
               (int)sizeof random);
  static const uint8_t zeros[32];
  CHECK(memcmp(random, zeros, sizeof random) != 0);
  double days = 0;
  CHECK_EQ_INT(codec->xCurrentTime(codec, &days), SQLITE_OK);
  CHECK(days > 2451544.5);
}

/* Cuts the file at path to its first size bytes. */
static int truncate_file(const char *path, size_t size) {
  size_t old_size;
  uint8_t *bytes = read_file(path, &old_size);
  int ok = bytes != NULL && size <= old_size && write_file(path, bytes, size);
  free(bytes);
  return ok;
}

/*
 * A database cut within page 1, which SQLite reads whole, fails as not a
 * database rather than reading zeros past the cut.
 */
static void codec_database_cut_within_page_1_fails_as_not_a_database(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "cut-page-1.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK(truncate_file(path, 1000));
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_NOTADB);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  CHECK_EQ_INT(failure.page_number, 1);
  sqlite3_close(db);
  remove_database(path);
}

/*
 * A journal record's page the file holds only part of, as a crash can cut
 * the end of a journal, reads as zeros, short, which ends SQLite's rollback.
 */
static void codec_journal_page_cut_short_reads_zeros_short(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "cut-record.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 5), SQLITE_OK);
  int page_size = (int)query_int(db, "pragma page_size");
  CHECK_EQ_INT(sqlite3_exec(db, "begin; update t set v = 'updated' || id",
                            NULL, NULL, NULL),
               SQLITE_OK);
  sqlite3_file *journal = NULL;
  CHECK_EQ_INT(sqlite3_file_control(db, "main", SQLITE_FCNTL_JOURNAL_POINTER,
                                    &journal),
               SQLITE_OK);
  sqlite3_int64 size = 0;
  CHECK_EQ_INT(journal->pMethods->xFileSize(journal, &size), SQLITE_OK);
  // Read as a record whose page starts 4 bytes before the end of a page that
  // ends the file: its number, then its page, past the end.
  uint8_t number[4];
  CHECK_EQ_INT(journal->pMethods->xRead(journal, number, 4, size - page_size),
               SQLITE_OK);
  CHECK((number[0] | number[1] | number[2] | number[3]) != 0);
  static uint8_t page[65536];
  static const uint8_t zeros[65536];
  memset(page, 1, sizeof page);
  CHECK_EQ_INT(
      journal->pMethods->xRead(journal, page, page_size, size - page_size + 4),
      SQLITE_IOERR_SHORT_READ);
  CHECK_EQ_BYTES(page, zeros, (size_t)page_size);
  CHECK_EQ_INT(sqlite3_exec(db, "rollback", NULL, NULL, NULL), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t where v like 'evolu-%'"),
               5);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(path);
}

/*
 * A record's checksum the file holds only part of, as a crash can cut the end
 * of a journal, reads short, with zeros past the cut, as xRead must.
 */
static void codec_journal_checksum_cut_short_reads_zeros_past_the_cut(void) {
  CHECK(set_up());
  char path[512];
  char journal_path[600];
  path_of(path, "cut-checksum.db");
  snprintf(journal_path, sizeof journal_path, "%s-journal", path);
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 5), SQLITE_OK);
  int page_size = (int)query_int(db, "pragma page_size");
  CHECK_EQ_INT(sqlite3_exec(db, "begin; update t set v = 'updated' || id",
                            NULL, NULL, NULL),
               SQLITE_OK);
  sqlite3_file *journal = NULL;
  CHECK_EQ_INT(sqlite3_file_control(db, "main", SQLITE_FCNTL_JOURNAL_POINTER,
                                    &journal),
               SQLITE_OK);
  // The first record follows the first header, a sector long.
  sqlite3_int64 at = read_be32_at(journal_path, 20);
  CHECK(truncate_file(journal_path, (size_t)(at + 4 + page_size + 2)));
  uint8_t number[4];
  static uint8_t page[65536];
  uint8_t checksum[4] = {1, 1, 1, 1};
  CHECK_EQ_INT(journal->pMethods->xRead(journal, number, 4, at), SQLITE_OK);
  CHECK_EQ_INT(journal->pMethods->xRead(journal, page, page_size, at + 4),
               SQLITE_OK);
  CHECK_EQ_INT(
      journal->pMethods->xRead(journal, checksum, 4, at + 4 + page_size),
      SQLITE_IOERR_SHORT_READ);
  CHECK_EQ_INT(checksum[2] | checksum[3], 0);
  sqlite3_exec(db, "rollback", NULL, NULL, NULL);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(path);
}

/*
 * Hot journals of a database whose first bytes a crash tore, without a page-1
 * record, in shapes that end the check's walk where SQLite's rollback stops:
 * as it is, ending at a header that isn't one; cut after its first segment's
 * records, ending where the next header would start, which a walk past it
 * would read as an I/O error; with a count past those records, likewise; and
 * with headers SQLite reads as no journal: cut short, of a sector or page
 * size SQLite refuses, or with a count SQLite computes from a file without a
 * whole record. Each ends as without a page-1 record: a plaintext database's
 * first bytes are refused, and an encrypted database's are no salt, so
 * SQLite's rollback of its records fails to authenticate them, and without a
 * rollback, page 1 fails. Without a page-1 record, a walk that read on would
 * end the same, so the next test checks the refused sector sizes with one.
 */
static void codec_hot_journal_check_of_malformed_journals_ends_as_without_a_page_1_record(
    void) {
  CHECK(set_up());
  enum { AS_IS, ONE_SEGMENT, PAST_RECORDS, CUT_HEADER, SECTOR_16,
         SECTOR_128K, SECTOR_1000, PAGE_1000, NO_WHOLE_RECORD };
  char path[512];
  char journal[600];
  path_of(path, "walked.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  for (int is_keyed = 0; is_keyed < 2; is_keyed++)
    for (int shape = AS_IS; shape <= NO_WHOLE_RECORD; shape++) {
      const uint8_t *key = is_keyed ? test_key : NULL;
      CHECK_EQ_INT(create_crashed_database(path, key), SQLITE_OK);
      CHECK(fill_bytes(path, 0, 16, 0));
      uint32_t sector_size = read_be32_at(journal, 20);
      uint32_t records = read_be32_at(journal, 8);
      size_t first_segment =
          sector_size + records * (read_be32_at(journal, 24) + 8);
      int ok = 1;
      if (shape == ONE_SEGMENT || shape == PAST_RECORDS)
        ok = truncate_file(journal, first_segment);
      if (shape == PAST_RECORDS)
        ok = ok && write_be32_at(journal, 8, records + 3);
      if (shape == CUT_HEADER) ok = truncate_file(journal, 24);
      if (shape == SECTOR_16) ok = write_be32_at(journal, 20, 16);
      if (shape == SECTOR_128K) ok = write_be32_at(journal, 20, 131072);
      if (shape == SECTOR_1000) ok = write_be32_at(journal, 20, 1000);
      if (shape == PAGE_1000) ok = write_be32_at(journal, 24, 1000);
      if (shape == NO_WHOLE_RECORD)
        ok = write_be32_at(journal, 8, 0xffffffff) &&
             truncate_file(journal, sector_size);
      CHECK(ok);
      sqlite3 *db = NULL;
      int rc = open_db(path, key, &db);
      evolu_codec_failure failure = {EVOLU_CODEC_FAILURE_NONE, 0};
      if (db != NULL) evolu_codec_take_failure(db, &failure);
      sqlite3_close(db);
      int expected = !is_keyed ? SQLITE_CANTOPEN
                     : shape <= PAST_RECORDS ? SQLITE_CORRUPT
                                             : SQLITE_NOTADB;
      if (rc != expected ||
          failure.type != (is_keyed
                               ? EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION
                               : EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED)) {
        char message[128];
        snprintf(message, sizeof message, "keyed %d, shape %d: %d, failure %d",
                 is_keyed, shape, rc, failure.type);
        test_fail(__FILE__, __LINE__, message);
        return;
      }
    }
  remove_database(path);
}

/*
 * SQLite reads a journal whose header gives sectors under 32 or over 65536
 * bytes as no journal and plays none of it, so the check takes no page-1
 * record from one either. The hot journal of a plaintext database whose first
 * bytes a crash tore, with page 1 in its first record, is rewritten for
 * 131072-byte sectors, its records moved to where they start, and for 16-byte
 * sectors, whose first record overlaps the header: page 2 there, which the
 * original size of 2 makes SQLite check, with the checksum that makes it
 * pass, and then the page-1 record. Either open stays refused, keeping the
 * journal as it was.
 */
static void codec_hot_journal_check_reads_no_journal_of_a_sector_size_sqlite_refuses(
    void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  char journal_copy[600];
  path_of(path, "refused-sector.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  snprintf(journal_copy, sizeof journal_copy, "%s-copy", journal);
  static const uint32_t refused_sizes[] = {131072, 16};
  for (size_t s = 0; s < sizeof refused_sizes / sizeof refused_sizes[0];
       s++) {
    CHECK_EQ_INT(create_crashed_database_with(
                     path, NULL,
                     "pragma user_version = 7; update t set v = 'updated' || "
                     "id"),
                 SQLITE_OK);
    CHECK(fill_bytes(path, 0, 16, 0));
    uint32_t sector_size = read_be32_at(journal, 20);
    uint32_t page_size = read_be32_at(journal, 24);
    uint32_t records = read_be32_at(journal, 8);
    uint32_t checksum_init = read_be32_at(journal, 12);
    size_t record_size = (size_t)page_size + 8;
    CHECK_EQ_INT(read_be32_at(journal, sector_size), 1);
    size_t size;
    uint8_t *bytes = read_file(journal, &size);
    CHECK(bytes != NULL);
    CHECK(records > 0 && sector_size + records * record_size <= size);
    uint32_t refused = refused_sizes[s];
    size_t out_size = refused == 16 ? 16 + 2 * record_size
                                    : refused + records * record_size;
    uint8_t *out = calloc(out_size, 1);
    CHECK(out != NULL);
    if (refused == 16) {
      // The first record's page number is the original size, and its page
      // starts with the sector and page sizes, then zeros.
      memcpy(out, bytes, 28);
      put_be32(out + 8, 0xffffffff);
      put_be32(out + 16, 2);
      put_be32(out + 20, refused);
      // As pager_cksum computes it.
      uint32_t checksum = checksum_init;
      for (int i = (int)page_size - 200; i > 0; i -= 200)
        checksum += out[20 + i];
      put_be32(out + 20 + page_size, checksum);
      memcpy(out + 16 + record_size, bytes + sector_size, record_size);
    } else {
      memcpy(out, bytes, sector_size);
      put_be32(out + 20, refused);
      memcpy(out + refused, bytes + sector_size, records * record_size);
    }
    free(bytes);
    int written = write_file(journal, out, out_size);
    free(out);
    CHECK(written);
    CHECK(copy_file(journal, journal_copy));
    sqlite3 *db = NULL;
    CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_CANTOPEN);
    evolu_codec_failure failure;
    CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
    CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED);
    sqlite3_close(db);
    CHECK(same_files(journal, journal_copy));
    remove_database(path);
    unlink(journal_copy);
  }
}

/*
 * SQLite compares no checksum of a record whose page is past the database's
 * original size, which the journal's first header gives, nor does the check
 * of a hot journal, so such a record before the page-1 record that restores a
 * torn salt doesn't end the check, even with a stale checksum. With a header
 * that says 2 pages, the first record's page is past it, and its checksum,
 * flipped, is stale: the check still takes the page-1 record's salt, and then
 * SQLite, which cuts the database to 2 pages, finds it corrupt itself.
 */
static void codec_hot_journal_check_skips_checksums_past_the_original_size(
    void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  path_of(path, "past-original.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  CHECK_EQ_INT(create_crashed_database_with(
                   path, test_key,
                   "update t set v = 'early' || id where id <= 3; pragma "
                   "user_version = 7; update t set v = 'updated' || id"),
               SQLITE_OK);
  CHECK(fill_bytes(path, 0, 16, 0));
  uint32_t sector_size = read_be32_at(journal, 20);
  uint32_t page_size = read_be32_at(journal, 24);
  CHECK(read_be32_at(journal, 16) > 2);
  CHECK(write_be32_at(journal, 16, 2));
  CHECK(read_be32_at(journal, sector_size) > 2);
  CHECK(flip_bit(journal, sector_size + 4 + page_size));
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_CORRUPT);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
  sqlite3_close(db);
  remove_database(path);
}

/*
 * The check compares the checksum of a record of the last page within the
 * original size, as SQLite's rollback does, so a stale one there ends the
 * check before the page-1 record that would give the torn salt, and the open
 * keeps the journal.
 */
static void codec_hot_journal_check_compares_the_checksum_at_the_original_size(
    void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  char journal_copy[600];
  path_of(path, "at-original.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  snprintf(journal_copy, sizeof journal_copy, "%s-copy", journal);
  CHECK_EQ_INT(create_crashed_database_with(
                   path, test_key,
                   "update t set v = 'early' || id where id <= 3; pragma "
                   "user_version = 7; update t set v = 'updated' || id"),
               SQLITE_OK);
  CHECK(fill_bytes(path, 0, 16, 0));
  uint32_t sector_size = read_be32_at(journal, 20);
  uint32_t page_size = read_be32_at(journal, 24);
  uint32_t first_page = read_be32_at(journal, sector_size);
  CHECK(first_page > 1 && first_page < read_be32_at(journal, 16));
  CHECK(write_be32_at(journal, 16, first_page));
  CHECK(flip_bit(journal, sector_size + 4 + page_size));
  CHECK(copy_file(journal, journal_copy));
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_CORRUPT);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  sqlite3_close(db);
  CHECK(same_files(journal, journal_copy));
  remove_database(path);
  unlink(journal_copy);
}

/*
 * A record before the page-1 record must authenticate with that record's
 * salt also past the original size, where no checksum is compared, because
 * the rollback's read of the record decrypts it before SQLite skips it. So a
 * record that fails ends the check, and the open keeps the journal.
 */
static void codec_hot_journal_check_takes_no_salt_past_a_record_that_fails(
    void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  char journal_copy[600];
  path_of(path, "past-failing.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  snprintf(journal_copy, sizeof journal_copy, "%s-copy", journal);
  CHECK_EQ_INT(create_crashed_database_with(
                   path, test_key,
                   "update t set v = 'early' || id where id <= 3; pragma "
                   "user_version = 7; update t set v = 'updated' || id"),
               SQLITE_OK);
  CHECK(fill_bytes(path, 0, 16, 0));
  uint32_t sector_size = read_be32_at(journal, 20);
  CHECK(read_be32_at(journal, sector_size) > 2);
  CHECK(write_be32_at(journal, 16, 2));
  CHECK(flip_bit(journal, sector_size + 4 + 100));
  CHECK(copy_file(journal, journal_copy));
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_CORRUPT);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  sqlite3_close(db);
  CHECK(same_files(journal, journal_copy));
  remove_database(path);
  unlink(journal_copy);
}

/*
 * SQLite's rollback stops at a segment header whose magic differs, as a kept
 * journal's stale next header is after syncJournal zeroes its first byte, so
 * the check stops there too: a page-1 record past it gives no salt, and the
 * open keeps the journal.
 */
static void codec_hot_journal_check_stops_at_a_header_whose_magic_differs(
    void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  char journal_copy[600];
  path_of(path, "magic-differs.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  snprintf(journal_copy, sizeof journal_copy, "%s-copy", journal);
  CHECK_EQ_INT(create_crashed_database_with(
                   path, test_key,
                   "update t set v = 'updated' || id where id <= 100;"
                   "pragma user_version = 7; update t set v = 'updated' || id"),
               SQLITE_OK);
  CHECK(fill_bytes(path, 0, 16, 0));
  size_t size;
  uint8_t *bytes = read_file(journal, &size);
  CHECK(bytes != NULL);
  uint32_t sector_size = read_be32_at(journal, 20);
  size_t record_size = (size_t)read_be32_at(journal, 24) + 8;
  // The header of the segment that holds the page-1 record.
  size_t page1_header = 0;
  int found = 0;
  for (size_t at = 0; !found && at + sector_size <= size;) {
    uint32_t records = (uint32_t)bytes[at + 8] << 24 |
                       (uint32_t)bytes[at + 9] << 16 |
                       (uint32_t)bytes[at + 10] << 8 | bytes[at + 11];
    size_t record = at + sector_size;
    for (uint32_t r = 0; r < records && record + record_size <= size; r++) {
      if (bytes[record] == 0 && bytes[record + 1] == 0 &&
          bytes[record + 2] == 0 && bytes[record + 3] == 1) {
        page1_header = at;
        found = 1;
        break;
      }
      record += record_size;
    }
    at = (record + sector_size - 1) / sector_size * sector_size;
  }
  free(bytes);
  CHECK(found && page1_header > 0);
  CHECK(fill_bytes(journal, page1_header, 1, 0));
  CHECK(copy_file(journal, journal_copy));
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_CORRUPT);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION);
  sqlite3_close(db);
  CHECK(same_files(journal, journal_copy));
  remove_database(path);
  unlink(journal_copy);
}

/*
 * The codec VFS opens a super-journal, which a hot journal of a transaction
 * over attached databases names, as its inner VFS does.
 */
static void codec_vfs_opens_a_super_journal_as_its_inner_vfs_does(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "super-journal");
  static const uint8_t names[8] = "a-journ";
  CHECK(write_file(path, names, sizeof names));
  sqlite3_vfs *codec = sqlite3_vfs_find(vfs_name);
  sqlite3_file *file = calloc(1, (size_t)codec->szOsFile);
  CHECK(file != NULL);
  int out_flags = 0;
  int rc = codec->xOpen(codec, path, file,
                        SQLITE_OPEN_READONLY | SQLITE_OPEN_SUPER_JOURNAL,
                        &out_flags);
  uint8_t read[8] = {0};
  if (rc == SQLITE_OK) {
    rc = file->pMethods->xRead(file, read, sizeof read, 0);
    file->pMethods->xClose(file);
  }
  free(file);
  unlink(path);
  CHECK_EQ_INT(rc, SQLITE_OK);
  CHECK_EQ_BYTES(read, names, sizeof names);
}

/* A VFS over a codec VFS, whose files wrap the codec's without faults. */
static sqlite3_vfs *outer_inner;

static int outer_open(sqlite3_vfs *vfs, sqlite3_filename name,
                      sqlite3_file *file, int flags, int *out_flags) {
  (void)vfs;
  FaultFile *outer = (FaultFile *)file;
  outer->inner = (sqlite3_file *)(outer + 1);
  int rc = outer_inner->xOpen(outer_inner, name, outer->inner, flags,
                              out_flags);
  if (rc != SQLITE_OK) {
    if (outer->inner->pMethods != NULL)
      outer->inner->pMethods->xClose(outer->inner);
    outer->base.pMethods = NULL;
    return rc;
  }
  outer->base.pMethods = &fault_io_methods;
  return SQLITE_OK;
}

/*
 * A VFS over a codec VFS reads a database through it, but writes none: the
 * codec opens a journal only for a database file it opened itself, whose
 * codec the journal's records use, and SQLite's database file is the outer
 * VFS's.
 */
static void codec_vfs_under_another_vfs_opens_no_journal(void) {
  CHECK(set_up());
  CHECK(register_fault_vfs());
  static const char outer_name[] = "evolu-codec-test-outer";
  static sqlite3_vfs outer;
  if (sqlite3_vfs_find(outer_name) == NULL) {
    outer_inner = sqlite3_vfs_find(vfs_name);
    outer = *sqlite3_vfs_find(NULL);
    outer.zName = outer_name;
    outer.pNext = NULL;
    outer.szOsFile = (int)sizeof(FaultFile) + outer_inner->szOsFile;
    outer.xOpen = outer_open;
    CHECK_EQ_INT(sqlite3_vfs_register(&outer, 0), SQLITE_OK);
  }
  char path[512];
  path_of(path, "outer.db");
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, NULL, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_open_v2(path, &db, SQLITE_OPEN_READWRITE, outer_name),
               SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  int rc = sqlite3_exec(db, "insert into t (v) values ('x')", NULL, NULL, NULL);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(path);
  CHECK_EQ_INT(rc, SQLITE_CANTOPEN);
}

/*
 * A journal SQLite couldn't delete, as over an inner VFS without xDelete, of
 * a database that's still empty, holds nothing to check: the database writes
 * over it with a random salt, not the zeros its empty file reads as. In
 * journal_mode = PERSIST, since without xDelete, SQLite would find each
 * committed journal hot.
 */
static void codec_kept_journal_of_an_empty_database_holds_nothing_to_check(
    void) {
  CHECK(set_up());
  CHECK(register_minimal_vfs());
  char path[512];
  char journal[600];
  path_of(path, "empty-kept-journal.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  remove_database(path);
  static uint8_t junk[600];
  memset(junk, 1, sizeof junk);
  CHECK(write_file(path, junk, 0));
  CHECK(write_file(journal, junk, sizeof junk));
  sqlite3 *db = NULL;
  CHECK_EQ_INT(
      evolu_codec_open(path, &db, minimal_codec_vfs_name, test_key, 0),
      SQLITE_OK);
  int rc = sqlite3_exec(db, "pragma journal_mode = persist", NULL, NULL, NULL);
  if (rc == SQLITE_OK) rc = create_rows(db, 3);
  long long rows = query_int(db, "select count(*) from t");
  sqlite3_close(db);
  size_t size = 0;
  uint8_t *bytes = read_file(path, &size);
  static const uint8_t zeros[16];
  int is_zero_salt =
      bytes == NULL || size < 16 || memcmp(bytes, zeros, sizeof zeros) == 0;
  free(bytes);
  remove_database(path);
  CHECK_EQ_INT(rc, SQLITE_OK);
  CHECK_EQ_INT(rows, 3);
  CHECK(!is_zero_salt);
}

/*
 * A journal shorter than its first header plays nothing back, so the
 * database opens as it was. A database cut to fewer bytes than its salt
 * takes the salt from its hot journal's page-1 record, which the rollback
 * restores.
 */
static void codec_journal_or_database_shorter_than_their_headers(void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  path_of(path, "short-header.db");
  snprintf(journal, sizeof journal, "%s-journal", path);
  remove_database(path);
  sqlite3 *db = NULL;
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  static const uint8_t magic[12] = {0xd9, 0xd5, 0x05, 0xf9,
                                    0x20, 0xa1, 0x63, 0xd7};
  CHECK(write_file(journal, magic, sizeof magic));
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "select count(*) from t"), 3);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);

  CHECK(create_fault_base(path, test_key, 1, 0));
  CHECK(truncate_file(path, 8));
  CHECK_EQ_INT(open_db(path, test_key, &db), SQLITE_OK);
  CHECK_EQ_INT(query_int(db, "pragma user_version"), 0);
  evolu_codec_failure failure;
  CHECK_EQ_INT(evolu_codec_take_failure(db, &failure), SQLITE_OK);
  CHECK_EQ_INT(failure.type, EVOLU_CODEC_FAILURE_NONE);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(path);
}

/* Removes every database the tests create. */
static void remove_databases(void) {
  static const char *const names[] = {
      "round-trip.db",     "other-key.db",          "other-key-copy.db",
      "plaintext.db",      "secure-delete.db",      "vacuum.db",
      "altered.db",        "large.db",              "methods.db",
      "hot.db",            "hot-wrong-key.db",      "hot-wrong-key-copy.db",
      "partial.db",        "empty-open.db",         "truncated.db",
      "torn-salt.db",      "first-bytes-salt.db",   "stale-record.db",
      "proven-salt.db",    "new-salt.db",           "plaintext-hot.db",
      "unsynced.db",       "sqlcipher.db",          "crash-base.db",
      "functions.db",      "matrix-base.db",        "matrix-work.db",
      "matrix-copy.db",    "journal-size.db",       "key-pragmas.db",
      "tampered-size.db",  "both-flags.db",       "not-codec-vfs.db",
      "other-reads.db",         "recreated.db",
      "recreated-source.db", "partial-writes.db",   "partial-writes-copy.db",
      "changed-record.db", "changed-record-source.db",
      "caller-key.db",     "attached.db",           "stale-salt.db",
      "stale-salt-source.db", "stale-salt-other.db", "no-page-size.db",
      "crash-work.db",     "crash-copy.db",         "skiplist-snapshot.db",
      "dit.db",            "plaintext-torn.db",     "no-random.db",
      "no-random-copy.db", "stale-page-1.db",       "stale-page-1-other.db",
      "unsynced-page-1.db", "unsynced-page-1-other.db", "first-failure.db",
      "creator.db",        "gated.db",              "gated-other.db",
      "replaced.db",       "replaced-source.db",    "unproven-then-own.db",
      "unproven-then-own-source.db", "nested.db", "nested-other.db",
      "nested-plain.db", "minimal.db", "never-wal.db", "wal-backup.db",
      "wal-backup-source.db", "stale-tail-work.db", "stale-tail-copy.db",
      "kept-journal-crash.db", "plaintext-tail.db", "own-allocations.db",
      "own-allocations-new.db", "own-allocations-hot.db",
      "own-allocations-hot-copy.db", "fault-base.db", "fault.db",
      "sqlite-allocations-base.db", "sqlite-allocations.db", "no-page.db",
      "no-page-copy.db",
      "write-version.db", "write-version-copy.db", "vfs-methods.db",
      "cut-page-1.db", "cut-record.db", "walked.db", "past-original.db",
      "at-original.db", "past-failing.db", "magic-differs.db",
      "refused-sector.db",
      "cut-checksum.db",
      "super-journal", "outer.db", "empty-kept-journal.db",
      "short-header.db", "empty-open-faults.db"};
  char path[512];
  for (size_t i = 0; i < sizeof names / sizeof names[0]; i++) {
    path_of(path, names[i]);
    remove_database(path);
  }
}

/*
 * Every database the tests create is in remove_databases' list, so the
 * temporary directory is empty after it and its removal succeeds.
 */
static void codec_tests_remove_every_database_they_create(void) {
  CHECK(set_up());
  remove_databases();
  CHECK_EQ_INT(rmdir(directory), 0);
  directory[0] = '\0';
}

void codec_suite(void) {
  RUN(codec_register_is_idempotent_and_needs_the_inner_vfs);
  RUN(codec_fails_cleanly_whichever_inner_call_fails);
  RUN(codec_fails_cleanly_when_sqlite_cant_allocate);
  RUN(codec_reader_of_another_page_size_fails_cleanly_when_a_read_fails);
  RUN(codec_refuses_reads_and_writes_where_no_page_is_and_reads_zeros_past_the_end);
  RUN(codec_refuses_page_1_with_a_write_format_version_other_than_1);
  RUN(codec_failed_open_has_no_failure_to_take);
  RUN(codec_take_failure_needs_a_codec_connection);
  RUN(codec_vfs_forwards_time_sleep_and_randomness);
  RUN(codec_database_cut_within_page_1_fails_as_not_a_database);
  RUN(codec_journal_page_cut_short_reads_zeros_short);
  RUN(codec_journal_checksum_cut_short_reads_zeros_past_the_cut);
  RUN(codec_hot_journal_check_of_malformed_journals_ends_as_without_a_page_1_record);
  RUN(codec_hot_journal_check_reads_no_journal_of_a_sector_size_sqlite_refuses);
  RUN(codec_hot_journal_check_skips_checksums_past_the_original_size);
  RUN(codec_hot_journal_check_compares_the_checksum_at_the_original_size);
  RUN(codec_hot_journal_check_takes_no_salt_past_a_record_that_fails);
  RUN(codec_hot_journal_check_stops_at_a_header_whose_magic_differs);
  RUN(codec_vfs_opens_a_super_journal_as_its_inner_vfs_does);
  RUN(codec_vfs_under_another_vfs_opens_no_journal);
  RUN(codec_kept_journal_of_an_empty_database_holds_nothing_to_check);
  RUN(codec_journal_or_database_shorter_than_their_headers);
  RUN(codec_inner_vfs_may_lack_optional_methods);
  RUN(codec_database_never_switches_to_wal);
  RUN(codec_database_refuses_a_backup_from_a_wal_database);
  RUN(codec_encrypted_database_stores_no_plaintext_and_reads_back);
  RUN(codec_database_with_another_key_fails_with_notadb_unchanged);
  RUN(codec_plaintext_database_is_plain_sqlite);
  RUN(codec_key_opens_only_a_database_file);
  RUN(codec_refuses_turning_secure_delete_off);
  RUN(codec_vacuum_changing_the_page_size_fails_and_keeps_the_database);
  RUN(codec_altered_page_fails_with_corrupt_naming_the_page);
  RUN(codec_reads_and_writes_rows_spanning_many_overflow_pages);
  RUN(codec_files_have_no_subpage_reads_and_version_1_methods);
  RUN(codec_reads_part_of_page_1_decrypted_when_it_authenticates);
  RUN(codec_connection_opened_while_empty_reads_another_page_size);
  RUN(codec_database_missing_its_last_byte_fails_with_corrupt);
  RUN(codec_journal_page_1_record_gives_the_salt_a_crash_tore);
  RUN(codec_hot_journal_takes_the_salt_from_the_first_bytes_last);
  RUN(codec_proven_key_ends_a_journal_at_a_record_that_fails);
  RUN(codec_proven_key_keeps_its_salt_for_another_hot_journal);
  RUN(codec_new_database_after_a_rolled_back_first_transaction_gets_a_random_salt);
  RUN(codec_plaintext_hot_journal_rolls_back_without_a_key);
  RUN(codec_plaintext_hot_journal_restores_a_torn_page_1);
  RUN(codec_journal_left_before_its_first_sync_is_not_hot);
  RUN(codec_opens_sqlcipher_files_only_when_allowed_whatever_their_page_size_bytes);
  RUN(codec_crashes_and_rollbacks_restore_every_layout_and_journal_mode);
  RUN(codec_crashes_roll_back_over_4096_byte_sectors);
  RUN(codec_crashes_roll_back_over_the_smallest_and_largest_sectors);
  RUN(codec_crashes_roll_back_over_stale_tails_of_kept_journals);
  RUN(codec_open_registers_the_core_functions);
  RUN(codec_journal_stores_writes_of_another_size_than_its_pages);
  RUN(codec_refuses_keying_through_sql);
  RUN(codec_page_1_storing_another_page_size_fails_also_with_sqlcipher_files);
  RUN(codec_open_refuses_both_flags_and_unknown_flags);
  RUN(codec_refuses_other_reads_before_reading);
  RUN(codec_open_refuses_a_vfs_that_isnt_a_codec_vfs);
  RUN(codec_proven_key_takes_a_recreated_databases_salt_for_its_hot_journal);
  RUN(codec_hot_journal_check_keeps_a_journal_whose_page_1_record_changed);
  RUN(codec_hot_journal_takes_the_salt_of_page_1_before_a_stale_record);
  RUN(codec_rollback_keeps_the_salt_past_a_stale_page_1_record);
  RUN(codec_rollback_keeps_the_salt_past_a_page_1_record_left_unsynced);
  RUN(codec_creating_connection_rolls_back_with_its_key_proven);
  RUN(codec_open_hands_its_key_to_its_own_thread_only);
  RUN(codec_open_keeps_its_key_from_databases_its_inner_vfs_opens);
  RUN(codec_proven_key_keeps_another_keys_hot_journal);
  RUN(codec_journal_written_after_an_unproven_one_is_proven);
  RUN(codec_part_of_a_page_1_without_a_page_size_is_its_first_100_bytes);
  RUN(codec_crashes_roll_back_truncating_commits_vacuums_and_large_pages);
  RUN(codec_skiplist_reads_one_snapshot_while_another_connection_writes);
  RUN(codec_refuses_writes_other_than_whole_pages_and_zero_fills_failed_reads);
  RUN(codec_leaves_the_callers_key_as_it_was);
  RUN(codec_runs_its_crypto_with_dit);
  RUN(codec_write_without_randomness_writes_nothing);
  RUN(codec_keeps_the_first_failure_until_taken);
  RUN(codec_fails_cleanly_when_its_own_allocations_fail);
  RUN(codec_fails_cleanly_when_a_new_databases_first_write_cant_allocate);
  RUN(codec_fails_cleanly_when_checking_a_hot_journal_cant_allocate);
  RUN(codec_rolls_back_a_hot_journal_that_stores_no_plaintext);
  RUN(codec_hot_journal_survives_a_wrong_key_and_no_key);
  RUN(codec_earlier_key_keeps_the_hot_journal_of_a_replacing_database);
  RUN(codec_rollback_of_a_new_database_takes_no_stale_salt);
  RUN(codec_wrong_key_keeps_a_journal_of_only_stale_records);
  RUN(codec_keyless_open_keeps_a_hot_journal_past_a_stale_plaintext_tail);
  RUN(codec_keyless_open_reads_no_record_past_a_count_of_0);
  RUN(codec_keyless_rollback_restores_page_1_from_a_later_segment);
  RUN(codec_keyless_open_stops_where_the_rollback_stops);
  RUN(codec_tests_remove_every_database_they_create);
  // Also when a filter skipped that test or it failed.
  if (directory[0] != '\0') {
    remove_databases();
    rmdir(directory);
  }
}
