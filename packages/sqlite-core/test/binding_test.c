/*
 * The native binding layer of binding/evolu_database.h over the host's default
 * VFS (unix), and over a fault VFS whose calls fail one at a time, with
 * SQLite's and the core's allocations failing in turn. Files live in a
 * temporary directory the suite creates and removes. Test names start with
 * binding_, so the suite runs alone with
 * `node packages/sqlite-core/scripts/test.mts binding_`, and the thread tests,
 * binding_threads_, also run under ThreadSanitizer.
 */
// mkdtemp, which macOS declares only with _DARWIN_C_SOURCE, and symlink.
#define _POSIX_C_SOURCE 200809L
#define _DARWIN_C_SOURCE

#include "test.h"

#include "evolu_codec.h"
#include "evolu_crypto.h"
#include "evolu_database.h"
#include "sqlcipher_pages.h"
#include "sqlite3.h"
#include "sqlite_allocator.h"

#include <dirent.h>
#include <errno.h>
#include <limits.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

static const uint8_t test_key[EVOLU_DATABASE_KEY_SIZE] = {
    1,  2,  3,  4,  5,  6,  7,  8,  9,  10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32};

static const uint8_t other_key[EVOLU_DATABASE_KEY_SIZE] = {
    32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17,
    16, 15, 14, 13, 12, 11, 10, 9,  8,  7,  6,  5,  4,  3,  2,  1};

static char directory[256];

/* The codec VFS the binding opens on, which tests may replace. */
static const char *binding_vfs;

/*
 * A VFS over the default one whose reads, writes, truncations, syncs and size
 * reads fail with an I/O error, one at a time: the fault_at-th counted call,
 * counting reads only with fault_reads_only and only reads and writes at or
 * past fault_from. A failed call sets the thread's errno to
 * fault_thread_errno, as a libc call would, and its file reports
 * fault_file_errno for SQLITE_FCNTL_LAST_ERRNO, as unix files report the
 * errno of their last failure, so a test tells the two apart. With
 * is_read_held, the next read, on any thread, waits until the test releases
 * it, so a call stays in flight without depending on timing.
 */
static sqlite3_vfs *fault_inner;
static int fault_at;
static int fault_calls;
static int fault_reads_only;
static sqlite3_int64 fault_from;

static pthread_mutex_t hold_mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t hold_changed = PTHREAD_COND_INITIALIZER;
static int is_read_held;
static int is_holding;
static int is_released;

static const int fault_thread_errno = EINTR;
static const int fault_file_errno = ENOSPC;

typedef struct {
  sqlite3_file base;
  sqlite3_file *inner;
  int last_errno;
} FaultFile;

#define FAULT_FILE_SIZE ((sizeof(FaultFile) + 7) & ~(size_t)7)

static void arm_fault(int at, int reads_only, sqlite3_int64 from) {
  fault_calls = 0;
  fault_at = at;
  fault_reads_only = reads_only;
  fault_from = from;
}

/* Whether the counted call fails, which records its errno. */
static int faults(sqlite3_file *file, int is_read, sqlite3_int64 offset) {
  // Disarmed, it counts nothing, so threads share it without a race.
  if (fault_at == 0) return 0;
  if ((fault_reads_only && !is_read) || offset < fault_from) return 0;
  if (++fault_calls != fault_at) return 0;
  ((FaultFile *)file)->last_errno = fault_file_errno;
  errno = fault_thread_errno;
  return 1;
}

static int fault_read(sqlite3_file *file, void *buffer, int amount,
                      sqlite3_int64 offset) {
  pthread_mutex_lock(&hold_mutex);
  if (is_read_held) {
    is_read_held = 0;
    is_holding = 1;
    pthread_cond_broadcast(&hold_changed);
    while (!is_released) pthread_cond_wait(&hold_changed, &hold_mutex);
  }
  pthread_mutex_unlock(&hold_mutex);
  if (faults(file, 1, offset)) return SQLITE_IOERR_READ;
  sqlite3_file *inner = ((FaultFile *)file)->inner;
  return inner->pMethods->xRead(inner, buffer, amount, offset);
}

static int fault_write(sqlite3_file *file, const void *buffer, int amount,
                       sqlite3_int64 offset) {
  if (faults(file, 0, offset)) return SQLITE_IOERR_WRITE;
  sqlite3_file *inner = ((FaultFile *)file)->inner;
  return inner->pMethods->xWrite(inner, buffer, amount, offset);
}

static int fault_truncate(sqlite3_file *file, sqlite3_int64 size) {
  if (faults(file, 0, fault_from)) return SQLITE_IOERR_TRUNCATE;
  sqlite3_file *inner = ((FaultFile *)file)->inner;
  return inner->pMethods->xTruncate(inner, size);
}

static int fault_sync(sqlite3_file *file, int flags) {
  if (faults(file, 0, fault_from)) return SQLITE_IOERR_FSYNC;
  sqlite3_file *inner = ((FaultFile *)file)->inner;
  return inner->pMethods->xSync(inner, flags);
}

static int fault_file_size(sqlite3_file *file, sqlite3_int64 *size) {
  if (faults(file, 0, fault_from)) return SQLITE_IOERR_FSTAT;
  sqlite3_file *inner = ((FaultFile *)file)->inner;
  return inner->pMethods->xFileSize(inner, size);
}

static int fault_file_control(sqlite3_file *file, int op, void *arg) {
  FaultFile *fault_file = (FaultFile *)file;
  if (op == SQLITE_FCNTL_LAST_ERRNO && fault_file->last_errno != 0) {
    *(int *)arg = fault_file->last_errno;
    return SQLITE_OK;
  }
  return fault_file->inner->pMethods->xFileControl(fault_file->inner, op, arg);
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
    fault_file_control,
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
  fault_file->inner = (sqlite3_file *)((char *)file + FAULT_FILE_SIZE);
  fault_file->last_errno = 0;
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

static const char fault_vfs_name[] = "evolu-binding-test-fault";
static const char fault_codec_vfs_name[] = "evolu-binding-test-codec";

static void reset_hooks(void) {
  evolu_test_database_vfs = binding_vfs;
  evolu_test_plain_vfs = NULL;
  evolu_test_threadsafe = sqlite3_threadsafe;
  evolu_test_compileoption_used = sqlite3_compileoption_used;
  evolu_test_random_fails = 0;
  evolu_test_allocations_left = -1;
  test_sqlite_allocations_left = -1;
  test_sqlite_malloc_hook = NULL;
  test_sqlite_realloc_hook = NULL;
  test_sqlite_free_hook = NULL;
}

/*
 * Resets the hooks a test may have left set, and at the first test that runs
 * creates the temporary directory, checks the build and registers the fault
 * VFS, so a filter that skips the suite creates nothing. Returns 0 when that
 * fails, which the test's CHECK reports.
 */
static int set_up(void) {
  if (binding_vfs == NULL) binding_vfs = evolu_test_database_vfs;
  reset_hooks();
  if (directory[0] != '\0') return 1;
  const char *tmp = getenv("TMPDIR");
  snprintf(directory, sizeof directory, "%s/evolu-binding-XXXXXX",
           tmp != NULL && tmp[0] != '\0' ? tmp : "/tmp");
  if (mkdtemp(directory) == NULL) {
    directory[0] = '\0';
    return 0;
  }
  evolu_database_error error;
  // The fault VFS and a codec VFS over it.
  static sqlite3_vfs vfs;
  fault_inner = sqlite3_vfs_find(NULL);
  vfs = *fault_inner;
  vfs.zName = fault_vfs_name;
  vfs.pNext = NULL;
  vfs.szOsFile = (int)FAULT_FILE_SIZE + fault_inner->szOsFile;
  vfs.xOpen = fault_open;
  return evolu_database_check_build(&error) == SQLITE_OK &&
         sqlite3_vfs_register(&vfs, 0) == SQLITE_OK &&
         evolu_codec_register(fault_codec_vfs_name, fault_vfs_name) ==
             SQLITE_OK;
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

static int file_exists(const char *path) {
  struct stat status;
  return lstat(path, &status) == 0;
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

static int contains(const uint8_t *bytes, size_t size, const void *needle,
                    size_t needle_size) {
  for (size_t i = 0; i + needle_size <= size; i++)
    if (memcmp(bytes + i, needle, needle_size) == 0) return 1;
  return 0;
}

/* Flips the lowest bit of the byte at offset of the file at path. */
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

/* Removes a file, or a directory with everything in it. */
static void remove_tree(const char *path) {
  struct stat status;
  if (lstat(path, &status) != 0) return;
  if (!S_ISDIR(status.st_mode)) {
    unlink(path);
    return;
  }
  DIR *entries = opendir(path);
  if (entries != NULL) {
    struct dirent *entry;
    while ((entry = readdir(entries)) != NULL) {
      if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0)
        continue;
      char child[1024];
      snprintf(child, sizeof child, "%s/%s", path, entry->d_name);
      remove_tree(child);
    }
    closedir(entries);
  }
  rmdir(path);
}

/* Removes the database at path and every file next to it the tests make. */
static void remove_database(const char *path) {
  static const char *const suffixes[] = {"", "-journal", "-wal", "-shm"};
  for (size_t i = 0; i < sizeof suffixes / sizeof suffixes[0]; i++) {
    char file[600];
    snprintf(file, sizeof file, "%s%s", path, suffixes[i]);
    remove_tree(file);
  }
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

static long long count_rows(sqlite3 *db) {
  return query_int(db,
                   "select count(*) from t where v like 'evolu-secret-row%'");
}

static int open_plain(const char *path, evolu_database **database,
                      evolu_database_error *error) {
  return evolu_database_open_file(path, strlen(path), database, error);
}

/* Whether PRAGMA journal_mode = mode sets mode, which it reports. */
static int sets_journal_mode(sqlite3 *db, const char *mode) {
  char sql[64];
  snprintf(sql, sizeof sql, "pragma journal_mode = %s", mode);
  sqlite3_stmt *statement = NULL;
  int is_set = sqlite3_prepare_v2(db, sql, -1, &statement, NULL) == SQLITE_OK &&
               sqlite3_step(statement) == SQLITE_ROW &&
               strcmp((const char *)sqlite3_column_text(statement, 0), mode) ==
                   0;
  sqlite3_finalize(statement);
  return is_set;
}

static int open_encrypted(const char *path, const uint8_t *key,
                          evolu_database **database,
                          evolu_database_error *error) {
  return evolu_database_open_encrypted_file(path, strlen(path), key, database,
                                            error);
}

/* Whether a connection holds the file at path, or -1 when the check fails. */
static int is_open(const char *path) {
  int open = -1;
  evolu_database_error error;
  int rc = evolu_database_is_file_open(path, strlen(path), &open, &error);
  evolu_database_clear_error(&error);
  return rc == SQLITE_OK ? open : -1;
}

static int delete_file(const char *path, evolu_database_error *error) {
  return evolu_database_delete_file(path, strlen(path), error);
}

/*
 * Creates at path a database of rows rows with key and closes it, and
 * returns 0 when a step fails.
 */
static int create_database(const char *path, const uint8_t *key, int rows) {
  remove_database(path);
  evolu_database *database = NULL;
  evolu_database_error error;
  int rc = key != NULL ? open_encrypted(path, key, &database, &error)
                       : open_plain(path, &database, &error);
  int ok = rc == SQLITE_OK &&
           create_rows(evolu_database_connection(database), rows) == SQLITE_OK;
  if (rc == SQLITE_OK) ok = evolu_database_close(database) == SQLITE_OK && ok;
  evolu_database_clear_error(&error);
  return ok;
}

/*
 * Leaves at path a database of rows rows with key and the hot journal of an
 * update that spilled pages into it, as a crash leaves them. Returns 0 when a
 * step fails.
 */
static int create_crashed_database(const char *path, const uint8_t *key,
                                   int rows) {
  char source[512];
  char source_journal[600];
  char journal[600];
  snprintf(source, sizeof source, "%s-source", path);
  snprintf(source_journal, sizeof source_journal, "%s-journal", source);
  snprintf(journal, sizeof journal, "%s-journal", path);
  remove_database(path);
  if (!create_database(source, key, rows)) return 0;
  sqlite3 *db = NULL;
  int ok = evolu_codec_open(source, &db, "evolu-codec", key,
                            EVOLU_CODEC_SQLCIPHER_FILES) == SQLITE_OK &&
           sqlite3_exec(db,
                        "pragma cache_size = 5; begin; "
                        "update t set v = 'updated' || id",
                        NULL, NULL, NULL) == SQLITE_OK &&
           copy_file(source, path) && copy_file(source_journal, journal);
  sqlite3_close(db);
  remove_database(source);
  return ok;
}

#define CHECK_ERROR(error, expected_type, expected_code)                       \
  do {                                                                         \
    CHECK_EQ_INT((error).type, expected_type);                                 \
    CHECK_EQ_INT((error).code, expected_code);                                 \
    CHECK((error).message != NULL);                                            \
  } while (0)

static int threadsafe_1(void) { return 1; }

static const char *refused_option;

static int refusing_compileoption_used(const char *name) {
  return strcmp(name, refused_option) != 0 && sqlite3_compileoption_used(name);
}

static void binding_check_build_registers_the_codec_vfs_over_the_default(
    void) {
  CHECK(set_up());
  evolu_database_error error;

  CHECK_EQ_INT(evolu_database_check_build(&error), SQLITE_OK);
  CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_NONE);
  CHECK_EQ_STR(evolu_test_database_vfs, "evolu-codec");
  CHECK(sqlite3_vfs_find("evolu-codec") != NULL);
  // Registered over the default VFS, which stays the default.
  CHECK_EQ_INT(evolu_codec_register("evolu-codec", NULL), SQLITE_OK);
  CHECK(sqlite3_vfs_find(NULL) != sqlite3_vfs_find("evolu-codec"));
}

static void binding_check_build_refuses_sqlite_without_the_core_options(void) {
  CHECK(set_up());
  static const char *const options[] = {"TEMP_STORE=3",
                                        "ENABLE_LOCKING_STYLE=0"};
  evolu_database_error error;

  evolu_test_threadsafe = threadsafe_1;
  CHECK_EQ_INT(evolu_database_check_build(&error), SQLITE_MISUSE);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_MISUSE);
  CHECK_EQ_STR(error.message,
               "SQLite was compiled without the options of sqlite_config.h.");
  evolu_test_threadsafe = sqlite3_threadsafe;
  for (size_t i = 0; i < sizeof options / sizeof options[0]; i++) {
    refused_option = options[i];
    evolu_test_compileoption_used = refusing_compileoption_used;
    CHECK_EQ_INT(evolu_database_check_build(&error), SQLITE_MISUSE);
    CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_MISUSE);
  }
  evolu_test_compileoption_used = sqlite3_compileoption_used;
  CHECK_EQ_INT(evolu_database_check_build(&error), SQLITE_OK);
}

static void binding_check_build_fails_when_another_vfs_has_the_name(void) {
  CHECK(set_up());
  static sqlite3_vfs taken;
  taken = *sqlite3_vfs_find(NULL);
  taken.zName = "evolu-binding-test-taken";
  taken.pNext = NULL;
  CHECK_EQ_INT(sqlite3_vfs_register(&taken, 0), SQLITE_OK);
  evolu_test_database_vfs = "evolu-binding-test-taken";
  evolu_database_error error;

  int rc = evolu_database_check_build(&error);

  sqlite3_vfs_unregister(&taken);
  CHECK_EQ_INT(rc, SQLITE_MISUSE);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_MISUSE);
  CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_MISUSE));
}

static void binding_opens_memory_databases_each_its_own_with_core_functions(
    void) {
  CHECK(set_up());
  evolu_database *a = NULL;
  evolu_database *b = NULL;
  evolu_database_error error;

  CHECK_EQ_INT(evolu_database_open_memory(&a, &error), SQLITE_OK);
  CHECK_EQ_INT(evolu_database_open_memory(&b, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(a);
  CHECK_EQ_INT(create_rows(db, 3), SQLITE_OK);

  CHECK_EQ_INT(count_rows(db), 3);
  CHECK_EQ_INT(query_int(evolu_database_connection(b),
                         "select count(*) from sqlite_schema"),
               0);
  CHECK(query_int(db, "select evolu_core_version()") > 0);
  CHECK_EQ_INT(evolu_database_close(a), SQLITE_OK);
  CHECK_EQ_INT(evolu_database_close(b), SQLITE_OK);
}

static void binding_opens_plain_and_encrypted_files(void) {
  CHECK(set_up());
  char plain[512];
  char encrypted[512];
  path_of(plain, "plain.db");
  path_of(encrypted, "encrypted.db");
  CHECK(create_database(plain, NULL, 10));
  CHECK(create_database(encrypted, test_key, 10));

  size_t size;
  uint8_t *bytes = read_file(plain, &size);
  int is_plain = bytes != NULL && memcmp(bytes, "SQLite format 3", 16) == 0;
  free(bytes);
  CHECK(is_plain);
  bytes = read_file(encrypted, &size);
  int stores_secret =
      bytes == NULL || contains(bytes, size, secret, sizeof secret - 1);
  // A new file gets the default layout: page 1 stores its page size, file
  // format versions 1 and 80 reserved bytes in plaintext.
  int is_default_layout =
      bytes != NULL && size > 20 &&
      memcmp(bytes + 16, "\x10\x00\x01\x01\x50", 5) == 0;
  free(bytes);
  CHECK(!stores_secret);
  CHECK(is_default_layout);

  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_plain(plain, &database, &error), SQLITE_OK);
  CHECK_EQ_INT(count_rows(evolu_database_connection(database)), 10);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  CHECK_EQ_INT(open_encrypted(encrypted, test_key, &database, &error),
               SQLITE_OK);
  CHECK_EQ_INT(count_rows(evolu_database_connection(database)), 10);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

/*
 * A memory database and a file whose skiplist functions ran, so the functions
 * keep statements, and the adapter left one of its own running: the close
 * finalizes each once and releases the file.
 */
static void binding_closes_a_database_whose_skiplist_functions_ran(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "skiplist.db");
  for (int is_file = 0; is_file <= 1; is_file++) {
    evolu_database *database = NULL;
    evolu_database_error error;
    CHECK_EQ_INT(is_file ? open_plain(path, &database, &error)
                         : evolu_database_open_memory(&database, &error),
                 SQLITE_OK);
    sqlite3 *db = evolu_database_connection(database);
    CHECK_EQ_INT(
        sqlite3_exec(db,
                     "create table evolu_timestamp (ownerId blob not null, t "
                     "blob not null, h1 integer, h2 integer, c integer, l "
                     "integer not null, primary key (ownerId, t)) strict;"
                     "create index evolu_timestamp_index on evolu_timestamp "
                     "(ownerId, l, t, h1, h2, c); begin; select "
                     "evolu_skiplist_insert(zeroblob(16), zeroblob(16), 1); "
                     "commit",
                     NULL, NULL, NULL),
        SQLITE_OK);
    CHECK_EQ_INT(query_int(db, "select evolu_skiplist_size(zeroblob(16))"), 1);
    sqlite3_stmt *running = NULL;
    CHECK_EQ_INT(sqlite3_prepare_v2(db, "select 1", -1, &running, NULL),
                 SQLITE_OK);
    CHECK_EQ_INT(sqlite3_step(running), SQLITE_ROW);
    CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  }
  int is_open = 1;
  evolu_database_error error;
  CHECK_EQ_INT(evolu_database_is_file_open(path, strlen(path), &is_open,
                                           &error),
               SQLITE_OK);
  CHECK(!is_open);
}

/*
 * Memory, plain and encrypted databases are defensive, so SQL can't write their
 * schema, even with PRAGMA writable_schema on, which they ignore.
 */
static void binding_databases_are_defensive(void) {
  CHECK(set_up());
  char plain[512];
  char encrypted[512];
  path_of(plain, "defensive-plain.db");
  path_of(encrypted, "defensive-encrypted.db");
  for (int kind = 0; kind < 3; kind++) {
    evolu_database *database = NULL;
    evolu_database_error error;
    CHECK_EQ_INT(kind == 0   ? evolu_database_open_memory(&database, &error)
                 : kind == 1 ? open_plain(plain, &database, &error)
                             : open_encrypted(encrypted, test_key, &database,
                                              &error),
                 SQLITE_OK);
    sqlite3 *db = evolu_database_connection(database);
    char *message = NULL;
    int rc = sqlite3_exec(db,
                          "create table t (a); pragma writable_schema = on; "
                          "update sqlite_schema set sql = 'create table t (b)' "
                          "where name = 't'",
                          NULL, NULL, &message);
    int is_refused = rc == SQLITE_ERROR && message != NULL &&
                     strstr(message, "may not be modified") != NULL;
    sqlite3_free(message);
    CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
    CHECK(is_refused);
  }
}

static void binding_opens_a_plain_file_with_plain_sqlite_on_the_default_vfs(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "plain-sqlite.db");
  remove_database(path);
  evolu_database *database = NULL;
  evolu_database_error error;

  CHECK_EQ_INT(open_plain(path, &database, &error), SQLITE_OK);

  CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_NONE);
  sqlite3 *db = evolu_database_connection(database);
  char *vfs = NULL;
  CHECK_EQ_INT(sqlite3_file_control(db, "main", SQLITE_FCNTL_VFSNAME, &vfs),
               SQLITE_OK);
  int is_default_vfs =
      vfs != NULL && strcmp(vfs, sqlite3_vfs_find(NULL)->zName) == 0;
  sqlite3_free(vfs);
  CHECK(is_default_vfs);
  // The core's functions, and WAL, which the codec VFS opens no file for.
  CHECK(query_int(db, "select evolu_core_version()") > 0);
  CHECK(sets_journal_mode(db, "wal"));
  CHECK(sets_journal_mode(db, "delete"));
  CHECK_EQ_INT(create_rows(db, 4), SQLITE_OK);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  CHECK_EQ_INT(is_open(path), 0);
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  int is_plain = bytes != NULL && memcmp(bytes, "SQLite format 3", 16) == 0;
  free(bytes);
  CHECK(is_plain);
  CHECK_EQ_INT(open_plain(path, &database, &error), SQLITE_OK);
  CHECK_EQ_INT(count_rows(evolu_database_connection(database)), 4);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_plain_open_refuses_keying_pragmas_with_sqlite_auth(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "plain-keying.db");
  remove_database(path);
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_plain(path, &database, &error), SQLITE_OK);
  static const char *const refused[] = {
      "pragma key = 'x'",           "PRAGMA KEY = 'x'",
      "pragma main.key = 'x'",      "pragma \"key\" = 'x'",
      "pragma [rekey] = 'x'",       "pragma hexkey = '00'",
      "pragma textkey = 'x'",       "pragma hexrekey = '00'",
      "pragma textrekey = 'x'",     "pragma cipher_page_size = 4096",
      "explain pragma key = 'x'",
  };
  sqlite3_stmt *statement = NULL;

  for (size_t i = 0; i < sizeof refused / sizeof refused[0]; i++) {
    CHECK_EQ_INT(evolu_database_prepare(database, refused[i],
                                        strlen(refused[i]), &statement,
                                        &error),
                 SQLITE_AUTH);
    CHECK(statement == NULL);
    CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_AUTH);
    evolu_database_clear_error(&error);
  }

  // Other pragmas and statements prepare as before.
  const char *allowed = "pragma user_version = 7";
  CHECK_EQ_INT(evolu_database_prepare(database, allowed, strlen(allowed),
                                      &statement, &error),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_step(statement), SQLITE_DONE);
  sqlite3_finalize(statement);
  CHECK_EQ_INT(
      query_int(evolu_database_connection(database), "pragma user_version"), 7);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  int is_plain = bytes != NULL && memcmp(bytes, "SQLite format 3", 16) == 0;
  free(bytes);
  CHECK(is_plain);
}

static void binding_plain_open_attaches_databases_read_only(void) {
  CHECK(set_up());
  char path[512], attached[512], sql[1200];
  path_of(path, "plain-attach.db");
  path_of(attached, "plain-attached.db");
  remove_database(path);
  remove_database(attached);
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_plain(path, &database, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(database);

  // SQLite ignores ATTACH's KEY clause, so ATTACH creates no file, and an
  // existing one opens read-only.
  snprintf(sql, sizeof sql, "attach '%s' as s key 'x'", attached);
  CHECK_EQ_INT(sqlite3_exec(db, sql, NULL, NULL, NULL), SQLITE_CANTOPEN);
  CHECK_EQ_INT(sqlite3_exec(db, "create table s.t (x)", NULL, NULL, NULL),
               SQLITE_ERROR);
  CHECK(!file_exists(attached));
  CHECK_EQ_INT(sqlite3_exec(db, "create table t (x)", NULL, NULL, NULL),
               SQLITE_OK);
  snprintf(sql, sizeof sql, "vacuum into '%s'", attached);
  CHECK_EQ_INT(sqlite3_exec(db, sql, NULL, NULL, NULL), SQLITE_OK);
  snprintf(sql, sizeof sql, "attach '%s' as s key 'x'", attached);
  CHECK_EQ_INT(sqlite3_exec(db, sql, NULL, NULL, NULL), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db, "insert into s.t values (1)", NULL, NULL,
                            NULL),
               SQLITE_READONLY);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_plain_and_encrypted_opens_share_the_registry(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "plain-held.db");
  remove_database(path);
  evolu_database *holder = NULL;
  evolu_database *other = NULL;
  evolu_database_error error;

  CHECK_EQ_INT(open_plain(path, &holder, &error), SQLITE_OK);
  CHECK_EQ_INT(is_open(path), 1);
  CHECK_EQ_INT(open_plain(path, &other, &error), SQLITE_BUSY);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_FILE_HELD, SQLITE_BUSY);
  evolu_database_clear_error(&error);
  CHECK(other == NULL);
  CHECK_EQ_INT(open_encrypted(path, test_key, &other, &error), SQLITE_BUSY);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_FILE_HELD, SQLITE_BUSY);
  evolu_database_clear_error(&error);
  CHECK_EQ_INT(evolu_database_close(holder), SQLITE_OK);

  char encrypted[512];
  path_of(encrypted, "encrypted-held.db");
  remove_database(encrypted);
  CHECK_EQ_INT(open_encrypted(encrypted, test_key, &holder, &error),
               SQLITE_OK);
  CHECK_EQ_INT(open_plain(encrypted, &other, &error), SQLITE_BUSY);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_FILE_HELD, SQLITE_BUSY);
  evolu_database_clear_error(&error);
  CHECK_EQ_INT(evolu_database_close(holder), SQLITE_OK);
  CHECK_EQ_INT(is_open(path), 0);
  CHECK_EQ_INT(is_open(encrypted), 0);
}

static void binding_plain_open_of_an_encrypted_file_fails_with_notadb(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "plain-of-encrypted.db");
  CHECK(create_database(path, test_key, 3));
  size_t size_before;
  uint8_t *before = read_file(path, &size_before);
  CHECK(before != NULL);
  evolu_database *database = NULL;
  evolu_database_error error;

  int rc = open_plain(path, &database, &error);

  size_t size_after;
  uint8_t *after = read_file(path, &size_after);
  int is_unchanged = after != NULL && size_after == size_before &&
                     memcmp(after, before, size_before) == 0;
  free(before);
  free(after);
  CHECK_EQ_INT(rc, SQLITE_NOTADB);
  CHECK(database == NULL);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_NOTADB);
  evolu_database_clear_error(&error);
  CHECK(is_unchanged);
  CHECK_EQ_INT(is_open(path), 0);
}

static void binding_plain_open_fails_cleanly_when_allocations_fail(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "plain-allocations.db");
  remove_database(path);
  int failures = 0;
  for (int allowed = 0;; allowed++) {
    evolu_database *database = NULL;
    evolu_database_error error;
    test_sqlite_allocations_left = allowed;
    int rc = open_plain(path, &database, &error);
    int is_exhausted = test_sqlite_allocations_left == -2;
    test_sqlite_allocations_left = -1;
    if (!is_exhausted) {
      CHECK_EQ_INT(rc, SQLITE_OK);
      CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
      break;
    }
    CHECK_EQ_INT(rc & 0xff, SQLITE_NOMEM);
    CHECK(database == NULL);
    CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_SQLITE);
    evolu_database_clear_error(&error);
    CHECK_EQ_INT(is_open(path), 0);
    failures++;
  }
  CHECK(failures > 1);
}

static void binding_encrypted_open_refuses_a_null_key(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "null-key.db");
  remove_database(path);
  // Set to NULL by the open.
  evolu_database *database = (evolu_database *)path;
  evolu_database_error error;

  CHECK_EQ_INT(evolu_database_open_encrypted_file(path, strlen(path), NULL,
                                                  &database, &error),
               SQLITE_MISUSE);

  CHECK(database == NULL);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_MISUSE);
  CHECK(!file_exists(path));
  CHECK_EQ_INT(is_open(path), 0);
}

static void binding_wrong_key_and_wrong_mode_fail_as_not_a_database(void) {
  CHECK(set_up());
  char plain[512];
  char encrypted[512];
  path_of(plain, "wrong-plain.db");
  path_of(encrypted, "wrong-encrypted.db");
  CHECK(create_database(plain, NULL, 3));
  CHECK(create_database(encrypted, test_key, 3));
  evolu_database *database = NULL;
  evolu_database_error error;

  // Page 1 doesn't authenticate with another key, nor a plaintext file's.
  const char *keyed[] = {encrypted, plain};
  for (size_t i = 0; i < 2; i++) {
    CHECK_EQ_INT(open_encrypted(keyed[i], other_key, &database, &error),
                 SQLITE_NOTADB);
    CHECK(database == NULL);
    CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_NOTADB);
    CHECK_EQ_STR(error.message, "file is not a database");
    CHECK_EQ_INT(error.codec_failure.type,
                 EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION);
    CHECK_EQ_INT(error.codec_failure.page_number, 1);
    CHECK_EQ_INT(error.system_errno, 0);
    evolu_database_clear_error(&error);
    CHECK_EQ_INT(is_open(keyed[i]), 0);
  }
  // Without a key, an encrypted file has no SQLite header.
  CHECK_EQ_INT(open_plain(encrypted, &database, &error), SQLITE_NOTADB);
  CHECK_EQ_INT(error.codec_failure.type, EVOLU_DATABASE_CODEC_FAILURE_NONE);
  evolu_database_clear_error(&error);
  CHECK_EQ_INT(is_open(encrypted), 0);
}

/*
 * A database of 10 rows in SQLCipher's layout, which expo-sqlite's SQLCipher
 * wrote: plain SQLite writes the pages, which are then encrypted from the
 * format.
 */
static void binding_opens_a_file_in_sqlciphers_layout(void) {
  CHECK(set_up());
  char path[512];
  char plain[600];
  path_of(path, "sqlcipher.db");
  snprintf(plain, sizeof plain, "%s-plain", path);
  remove_database(plain);
  remove_database(path);
  sqlite3 *db = NULL;
  int reserved = EVOLU_CODEC_RESERVED_SIZE;
  CHECK_EQ_INT(sqlite3_open_v2(plain, &db,
                               SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
                               NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_file_control(db, "main", SQLITE_FCNTL_RESERVE_BYTES,
                                    &reserved),
               SQLITE_OK);
  CHECK_EQ_INT(create_rows(db, 10), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  size_t size;
  uint8_t *bytes = read_file(plain, &size);
  remove_database(plain);
  CHECK(bytes != NULL && size % 4096 == 0);
  uint8_t *encrypted = malloc(size);
  static const uint8_t salt[16] = {0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5,
                                   0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab,
                                   0xac, 0xad, 0xae, 0xaf};
  for (size_t at = 0; encrypted != NULL && at < size; at += 4096) {
    uint32_t page_number = (uint32_t)(at / 4096) + 1;
    uint8_t iv[16];
    memset(iv, (int)page_number, sizeof iv);
    build_sqlcipher_page(test_key, salt, iv, page_number, bytes + at, 4096,
                         encrypted + at);
  }
  int is_written = encrypted != NULL && write_file(path, encrypted, size);
  free(bytes);
  free(encrypted);
  CHECK(is_written);
  evolu_database *database = NULL;
  evolu_database_error error;

  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  CHECK_EQ_INT(count_rows(evolu_database_connection(database)), 10);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_open_creates_a_missing_directory_with_mode_0700(void) {
  CHECK(set_up());
  char created[512];
  char path[512];
  path_of(created, "created");
  path_of(path, "created/new.db");
  remove_tree(created);
  evolu_database *database = NULL;
  evolu_database_error error;

  CHECK_EQ_INT(open_plain(path, &database, &error), SQLITE_OK);

  struct stat status;
  CHECK_EQ_INT(stat(created, &status), 0);
  CHECK(S_ISDIR(status.st_mode));
  CHECK_EQ_INT(status.st_mode & 0777, 0700);
  CHECK_EQ_INT(is_open(path), 1);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  CHECK_EQ_INT(is_open(path), 0);
  // The file it created has the mode SQLite gives a new database's.
  char sqlite_made[512];
  path_of(sqlite_made, "created/sqlite-made.db");
  sqlite3 *db = NULL;
  CHECK_EQ_INT(sqlite3_open_v2(sqlite_made, &db,
                               SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
                               NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  struct stat sqlite_status;
  CHECK_EQ_INT(stat(path, &status), 0);
  CHECK_EQ_INT(stat(sqlite_made, &sqlite_status), 0);
  CHECK_EQ_INT(status.st_mode & 0777, sqlite_status.st_mode & 0777);
}

static void binding_open_fails_with_cantopen_when_it_cant_create_the_file(
    void) {
  CHECK(set_up());
  // Root writes to any directory.
  if (geteuid() == 0) return;
  char locked[512];
  char path[512];
  path_of(locked, "locked");
  path_of(path, "locked/x.db");
  remove_tree(locked);
  CHECK_EQ_INT(mkdir(locked, 0500), 0);
  evolu_database *database = NULL;
  evolu_database_error error;

  int rc = open_plain(path, &database, &error);

  chmod(locked, 0700);
  CHECK_EQ_INT(rc, SQLITE_CANTOPEN);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CANTOPEN);
  CHECK_EQ_INT(error.system_errno, EACCES);
  CHECK(!file_exists(path));
  CHECK_EQ_INT(is_open(path), 0);
}

static void binding_open_in_a_missing_parent_fails_with_cantopen_and_errno(
    void) {
  CHECK(set_up());
  char parent[512];
  char path[512];
  path_of(parent, "missing-parent");
  path_of(path, "missing-parent/missing/x.db");
  evolu_database *database = NULL;
  evolu_database_error error;

  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error),
               SQLITE_CANTOPEN);

  CHECK(database == NULL);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CANTOPEN);
  CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_CANTOPEN));
  CHECK_EQ_INT(error.system_errno, ENOENT);
  CHECK_EQ_INT(error.sql_offset, -1);
  CHECK_EQ_INT(error.codec_failure.type, EVOLU_DATABASE_CODEC_FAILURE_NONE);
  CHECK(!file_exists(parent));
}

/* Each path function's result for path, setting error. */
static int path_function(int function, const char *path, size_t size,
                         evolu_database_error *error) {
  evolu_database *database = NULL;
  int open = 0;
  switch (function) {
  case 0:
    return evolu_database_open_file(path, size, &database, error);
  case 1:
    return evolu_database_open_encrypted_file(path, size, test_key, &database,
                                              error);
  case 2:
    return evolu_database_is_file_open(path, size, &open, error);
  default:
    return evolu_database_delete_file(path, size, error);
  }
}

static void binding_path_functions_refuse_a_path_that_names_no_file(void) {
  CHECK(set_up());
  char nul[512];
  path_of(nul, "nul.db");
  size_t nul_size = strlen(nul);
  // The C string would end at "nul".
  nul[nul_size - 3] = '\0';
  static const char not_absolute[] = "The path isn't absolute.";
  static const char no_file_name[] = "The path doesn't end in a file name.";
  const struct {
    const char *path;
    size_t size;
    const char *message;
  } cases[] = {
      {nul, nul_size, "The path contains a NUL character."},
      {"", 0, not_absolute},
      {"relative.db", 11, not_absolute},
      {"/", 1, no_file_name},
      {"/tmp/", 5, no_file_name},
      {"/tmp/.", 6, no_file_name},
      {"/tmp/..", 7, no_file_name},
  };
  for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++)
    for (int function = 0; function < 4; function++) {
      evolu_database_error error;
      CHECK_EQ_INT(path_function(function, cases[i].path, cases[i].size,
                                 &error),
                   SQLITE_MISUSE);
      CHECK_ERROR(error, EVOLU_DATABASE_ERROR_INVALID_PATH, SQLITE_MISUSE);
      CHECK_EQ_STR(error.message, cases[i].message);
      evolu_database_clear_error(&error);
    }
  CHECK(!file_exists(nul));

  // Names that only start with a dot are file names, also in the root.
  static const char *const names[] = {"x", ".x", "..x", "x.", ".x."};
  for (size_t i = 0; i < sizeof names / sizeof names[0]; i++) {
    char path[512];
    path_of(path, names[i]);
    CHECK_EQ_INT(is_open(path), 0);
  }
  CHECK_EQ_INT(is_open("/evolu-binding-test-no-such.db"), 0);
}

static void binding_open_refuses_a_database_path_that_is_a_symbolic_link(
    void) {
  CHECK(set_up());
  char target[512];
  char link[512];
  char dangling[512];
  char missing[512];
  path_of(target, "link-target.db");
  path_of(link, "link.db");
  path_of(dangling, "dangling.db");
  path_of(missing, "missing.db");
  CHECK(create_database(target, NULL, 3));
  remove_database(link);
  remove_database(dangling);
  remove_database(missing);
  CHECK_EQ_INT(symlink(target, link), 0);
  CHECK_EQ_INT(symlink(missing, dangling), 0);
  evolu_database *database = NULL;
  evolu_database_error error;

  const char *links[] = {link, dangling};
  for (size_t i = 0; i < 2; i++) {
    CHECK_EQ_INT(open_plain(links[i], &database, &error), SQLITE_CANTOPEN);
    CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CANTOPEN);
    CHECK_EQ_INT(error.system_errno, ELOOP);
    CHECK_EQ_INT(open_encrypted(links[i], test_key, &database, &error),
                 SQLITE_CANTOPEN);
    CHECK_EQ_INT(error.system_errno, ELOOP);
    CHECK_EQ_INT(is_open(links[i]), 0);
  }
  CHECK_EQ_INT(is_open(target), 0);
  CHECK(!file_exists(missing));
}

static void binding_path_too_long_for_a_directory_or_name_fails_with_cantopen(
    void) {
  CHECK(set_up());
  static char path[PATH_MAX + 16];
  path[0] = '/';
  memset(path + 1, 'a', PATH_MAX);
  memcpy(path + 1 + PATH_MAX, "/x.db", 6);

  // And a file name longer than a directory entry holds.
  char long_name[512];
  path_of(long_name, "");
  size_t long_size = strlen(long_name);
  memset(long_name + long_size, 'a', 300);
  long_name[long_size + 300] = '\0';
  const char *paths[] = {path, long_name};

  for (size_t i = 0; i < 2; i++)
    for (int function = 0; function < 4; function++) {
      evolu_database_error error;
      CHECK_EQ_INT(path_function(function, paths[i], strlen(paths[i]), &error),
                   SQLITE_CANTOPEN);
      CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CANTOPEN);
      CHECK_EQ_INT(error.system_errno, ENAMETOOLONG);
    }
}

static void binding_directory_that_doesnt_resolve_fails_with_cantopen(void) {
  CHECK(set_up());
  char loop[512];
  char path[512];
  path_of(loop, "loop");
  path_of(path, "loop/x.db");
  remove_tree(loop);
  CHECK_EQ_INT(symlink(loop, loop), 0);

  for (int function = 0; function < 4; function++) {
    evolu_database_error error;
    CHECK_EQ_INT(path_function(function, path, strlen(path), &error),
                 SQLITE_CANTOPEN);
    CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CANTOPEN);
    CHECK_EQ_INT(error.system_errno, ELOOP);
  }
}

static void binding_directory_that_doesnt_exist_holds_no_file(void) {
  CHECK(set_up());
  char absent[512];
  char regular[512];
  char in_absent[512];
  char under_regular[512];
  char in_regular[512];
  path_of(absent, "absent");
  path_of(regular, "regular");
  path_of(in_absent, "absent/x.db");
  path_of(under_regular, "regular/sub/x.db");
  path_of(in_regular, "regular/x.db");
  remove_tree(absent);
  CHECK(write_file(regular, (const uint8_t *)"x", 1));

  // ENOENT and ENOTDIR, and a directory that is a file, which holds none.
  const char *paths[] = {in_absent, under_regular, in_regular};
  for (size_t i = 0; i < 3; i++) {
    CHECK_EQ_INT(is_open(paths[i]), 0);
    evolu_database_error error;
    CHECK_EQ_INT(delete_file(paths[i], &error), SQLITE_OK);
    CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_NONE);
  }
  CHECK(!file_exists(absent));
}

static void binding_held_file_refuses_a_second_open_and_touches_no_file(
    void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  char copy[512];
  char journal_copy[512];
  path_of(path, "held.db");
  path_of(copy, "held-copy.db");
  path_of(journal_copy, "held-copy.db-journal");
  snprintf(journal, sizeof journal, "%s-journal", path);
  CHECK(create_database(path, test_key, 30));
  evolu_database *holder = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_encrypted(path, test_key, &holder, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(holder);
  // A transaction that spilled pages into the database, as a crash would
  // leave it for another connection to roll back.
  CHECK_EQ_INT(sqlite3_exec(db,
                            "pragma cache_size = 5; begin; "
                            "update t set v = 'updated' || id",
                            NULL, NULL, NULL),
               SQLITE_OK);
  CHECK(copy_file(path, copy) && copy_file(journal, journal_copy));
  evolu_database *second = NULL;

  CHECK_EQ_INT(open_encrypted(path, test_key, &second, &error), SQLITE_BUSY);
  CHECK(second == NULL);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_FILE_HELD, SQLITE_BUSY);
  CHECK_EQ_STR(error.message,
               "Another connection of this process has the database open.");
  CHECK_EQ_INT(open_encrypted(path, other_key, &second, &error), SQLITE_BUSY);
  CHECK_EQ_INT(open_plain(path, &second, &error), SQLITE_BUSY);
  CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_FILE_HELD);

  CHECK(same_files(path, copy));
  CHECK(same_files(journal, journal_copy));
  CHECK_EQ_INT(sqlite3_exec(db, "rollback", NULL, NULL, NULL), SQLITE_OK);
  CHECK_EQ_INT(count_rows(db), 30);
  CHECK_EQ_INT(evolu_database_close(holder), SQLITE_OK);
  remove_database(copy);
}

static void binding_close_and_failed_opens_release_only_their_own_entries(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "release.db");
  CHECK(create_database(path, test_key, 3));
  evolu_database *database = NULL;
  evolu_database *second = NULL;
  evolu_database_error error;

  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  CHECK_EQ_INT(is_open(path), 1);
  CHECK_EQ_INT(open_encrypted(path, test_key, &second, &error), SQLITE_BUSY);
  // The refused open removed no entry of the connection's.
  CHECK_EQ_INT(is_open(path), 1);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  CHECK_EQ_INT(is_open(path), 0);
  CHECK_EQ_INT(open_encrypted(path, other_key, &database, &error),
               SQLITE_NOTADB);
  evolu_database_clear_error(&error);
  CHECK_EQ_INT(is_open(path), 0);
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  CHECK_EQ_INT(is_open(path), 1);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_path_through_a_symlinked_directory_is_the_same_entry(
    void) {
  CHECK(set_up());
  char real[512];
  char alias[512];
  char path[512];
  char alias_path[512];
  path_of(real, "real");
  path_of(alias, "alias");
  path_of(path, "real/x.db");
  path_of(alias_path, "alias/x.db");
  remove_tree(real);
  remove_tree(alias);
  CHECK_EQ_INT(mkdir(real, 0700), 0);
  CHECK_EQ_INT(symlink(real, alias), 0);
  evolu_database *database = NULL;
  evolu_database *second = NULL;
  evolu_database_error error;

  CHECK_EQ_INT(open_plain(path, &database, &error), SQLITE_OK);
  CHECK_EQ_INT(is_open(alias_path), 1);
  CHECK_EQ_INT(open_plain(alias_path, &second, &error), SQLITE_BUSY);
  CHECK_EQ_INT(delete_file(alias_path, &error), SQLITE_BUSY);
  CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_FILE_HELD);
  CHECK(file_exists(path));
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  CHECK_EQ_INT(open_plain(alias_path, &database, &error), SQLITE_OK);
  CHECK_EQ_INT(is_open(path), 1);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

/*
 * With path open, another name of its file is held too: its open is refused,
 * it's open, and its delete is refused, leaving both names.
 */
static void refuses_another_name_of_an_open_file(const char *path,
                                                 const char *other) {
  evolu_database *database = NULL;
  evolu_database *second = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_plain(path, &database, &error), SQLITE_OK);

  CHECK_EQ_INT(open_plain(other, &second, &error), SQLITE_BUSY);
  CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_FILE_HELD);
  CHECK_EQ_INT(is_open(other), 1);
  CHECK_EQ_INT(delete_file(other, &error), SQLITE_BUSY);
  CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_FILE_HELD);
  CHECK(file_exists(path) && file_exists(other));
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_registry_holds_a_file_under_a_hard_link_too(void) {
  CHECK(set_up());
  char path[512];
  char link_path[512];
  path_of(path, "hard-link.db");
  path_of(link_path, "hard-link-other.db");
  remove_database(path);
  remove_database(link_path);
  CHECK(create_database(path, NULL, 1));
  CHECK_EQ_INT(link(path, link_path), 0);

  refuses_another_name_of_an_open_file(path, link_path);
}

static void binding_registry_holds_a_file_under_any_case_where_case_is_ignored(
    void) {
  CHECK(set_up());
  char path[512];
  char upper[512];
  path_of(path, "case.db");
  path_of(upper, "CASE.DB");
  remove_database(path);
  CHECK(create_database(path, NULL, 1));
  // Only on a volume that ignores case, as macOS's do by default, and an iOS
  // app's on a Mac, but not Linux's.
  if (!file_exists(upper)) return;

  refuses_another_name_of_an_open_file(path, upper);
}

static void binding_registry_holds_several_files_and_releases_each_its_own(
    void) {
  CHECK(set_up());
  enum { count = 4 };
  char paths[count][512];
  evolu_database *databases[count];
  evolu_database_error error;
  for (int i = 0; i < count; i++) {
    char name[32];
    snprintf(name, sizeof name, "several-%d.db", i);
    path_of(paths[i], name);
    remove_database(paths[i]);
    CHECK_EQ_INT(open_plain(paths[i], &databases[i], &error), SQLITE_OK);
  }

  // From the middle, the oldest, the newest and the last.
  static const int closing[count] = {2, 0, 3, 1};
  int is_closed[count] = {0};
  for (int i = 0; i < count; i++) {
    CHECK_EQ_INT(evolu_database_close(databases[closing[i]]), SQLITE_OK);
    is_closed[closing[i]] = 1;
    for (int j = 0; j < count; j++)
      CHECK_EQ_INT(is_open(paths[j]), !is_closed[j]);
  }
}

static void binding_open_of_a_directory_fails_with_sqlites_cantopen_and_errno(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "a-directory.db");
  remove_database(path);
  CHECK_EQ_INT(mkdir(path, 0700), 0);
  evolu_database *database = NULL;
  evolu_database_error error;

  CHECK_EQ_INT(open_plain(path, &database, &error), SQLITE_CANTOPEN);

  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CANTOPEN);
  CHECK_EQ_STR(error.message, "unable to open database file");
  CHECK_EQ_INT(error.system_errno, EISDIR);
  evolu_database_clear_error(&error);
  CHECK_EQ_INT(is_open(path), 0);
  remove_database(path);
}

static void binding_open_on_a_vfs_that_isnt_a_codec_vfs_fails_with_misuse(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "not-codec.db");
  remove_database(path);
  evolu_test_database_vfs = sqlite3_vfs_find(NULL)->zName;
  evolu_database *database = NULL;
  evolu_database_error error;

  CHECK_EQ_INT(evolu_database_open_memory(&database, &error), SQLITE_MISUSE);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_MISUSE);
  CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_MISUSE));
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error),
               SQLITE_MISUSE);
  CHECK(database == NULL);
  CHECK_EQ_INT(is_open(path), 0);
  // The open created the file empty, which opens as a new database.
  struct stat status;
  CHECK_EQ_INT(stat(path, &status), 0);
  CHECK_EQ_INT(status.st_size, 0);
}

static void binding_memory_open_fails_cleanly_when_allocations_fail(void) {
  CHECK(set_up());
  int failures = 0;
  for (int allowed = 0;; allowed++) {
    evolu_database *database = NULL;
    evolu_database_error error;
    test_sqlite_allocations_left = allowed;
    int rc = evolu_database_open_memory(&database, &error);
    int is_exhausted = test_sqlite_allocations_left == -2;
    test_sqlite_allocations_left = -1;
    if (!is_exhausted) {
      CHECK_EQ_INT(rc, SQLITE_OK);
      CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
      break;
    }
    CHECK_EQ_INT(rc & 0xff, SQLITE_NOMEM);
    CHECK(database == NULL);
    CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_SQLITE);
    evolu_database_clear_error(&error);
    failures++;
  }
  CHECK(failures > 1);
}

static void binding_close_finalizes_the_statements_sqlite_holds(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "statements.db");
  CHECK(create_database(path, test_key, 3));
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(database);
  sqlite3_stmt *stepped = NULL;
  sqlite3_stmt *prepared = NULL;
  CHECK_EQ_INT(sqlite3_prepare_v2(db, "select * from t", -1, &stepped, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_step(stepped), SQLITE_ROW);
  CHECK_EQ_INT(sqlite3_prepare_v2(db, "select 1", -1, &prepared, NULL),
               SQLITE_OK);

  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);

  CHECK_EQ_INT(is_open(path), 0);
}

static void binding_close_keeps_the_entry_while_sqlite_cant_close(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "unclosable.db");
  CHECK(create_database(path, NULL, 3));
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_plain(path, &database, &error), SQLITE_OK);
  sqlite3 *copy = NULL;
  CHECK_EQ_INT(sqlite3_open_v2(":memory:", &copy,
                               SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
                               NULL),
               SQLITE_OK);
  // A backup escaped the binding's tracking.
  sqlite3_backup *backup = sqlite3_backup_init(
      copy, "main", evolu_database_connection(database), "main");
  CHECK(backup != NULL);

  CHECK_EQ_INT(evolu_database_close(database), SQLITE_BUSY);
  CHECK_EQ_INT(is_open(path), 1);

  CHECK_EQ_INT(sqlite3_backup_finish(backup), SQLITE_OK);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  CHECK_EQ_INT(is_open(path), 0);
  CHECK_EQ_INT(sqlite3_close(copy), SQLITE_OK);
}

/*
 * Prepares the NUL-terminated sql, and returns the record's type, finalizing
 * the statement a prepare that succeeded returns.
 */
static int prepare_type(evolu_database *database, const char *sql) {
  sqlite3_stmt *statement = NULL;
  evolu_database_error error;
  int rc = evolu_database_prepare(database, sql, strlen(sql), &statement,
                                  &error);
  int type = error.type;
  // A failed prepare returns no statement and the record's code.
  if (rc != SQLITE_OK && (statement != NULL || rc != error.code)) type = -1;
  evolu_database_clear_error(&error);
  sqlite3_finalize(statement);
  return type;
}

static void binding_prepare_takes_one_statement_and_what_sqlite_skips_after_it(
    void) {
  CHECK(set_up());
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(evolu_database_open_memory(&database, &error), SQLITE_OK);
  // What SQLite 3.54.1's tokenizer skips: semicolons; whitespace, which a \v
  // continues but can't start; byte order marks; comments to a newline or the
  // end; and block comments to their end, or the end of the SQL, when a byte
  // follows the "/*", so "/*/" stays open.
  static const char *const accepted[] = {
      "select 1",
      "select 1;",
      ";; select 1",
      "select 1;;",
      "select 1; \t\n\f\r",
      "select 1;\t \v",
      "select 1;\n",
      "select 1;\f",
      "select 1;\r",
      "select 1; \v",
      "select 1;\xef\xbb\xbf",
      "select 1;\xef\xbb\xbf;\xef\xbb\xbf",
      "select 1 -- one",
      "select 1; --",
      "select 1; -- one\n; -- two",
      "select 1; /* one */",
      "select 1; /**/;",
      "select 1; /* open",
      "select 1; /*/",
      "select 1;/* * / */ -- /*\n\t;",
  };
  for (size_t i = 0; i < sizeof accepted / sizeof accepted[0]; i++)
    CHECK_EQ_INT(prepare_type(database, accepted[i]),
                 EVOLU_DATABASE_ERROR_NONE);
  static const char *const refused[] = {
      "select 1; select 2",
      "select 1;\vselect 2",
      "select 1;\v",
      "select 1;\xef",
      "select 1;\xef\xbb",
      "select 1;\xef\xbb\xbe",
      "select 1;\xef\xbc\xbf",
      "select 1; -",
      "select 1; -x",
      "select 1; -- one\nselect 2",
      "select 1; \x01",
      "select 1; /",
      "select 1; /*",
      "select 1; /x",
      "select 1; /xx",
      "select 1; /* one */ x",
      "select 1; x",
  };
  for (size_t i = 0; i < sizeof refused / sizeof refused[0]; i++)
    CHECK_EQ_INT(prepare_type(database, refused[i]),
                 EVOLU_DATABASE_ERROR_MULTIPLE_STATEMENTS);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_prepare_refuses_sql_without_a_statement(void) {
  CHECK(set_up());
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(evolu_database_open_memory(&database, &error), SQLITE_OK);
  static const char *const empty[] = {"", " \n", ";", "; ;", "-- one",
                                      "/* one */", "\xef\xbb\xbf"};
  for (size_t i = 0; i < sizeof empty / sizeof empty[0]; i++) {
    sqlite3_stmt *statement = NULL;
    int rc = evolu_database_prepare(database, empty[i], strlen(empty[i]),
                                    &statement, &error);
    CHECK_EQ_INT(rc, SQLITE_MISUSE);
    CHECK(statement == NULL);
    CHECK_ERROR(error, EVOLU_DATABASE_ERROR_EMPTY_SQL, SQLITE_MISUSE);
    CHECK_EQ_STR(error.message, "The SQL contains no statement.");
    evolu_database_clear_error(&error);
  }
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_prepare_never_runs_what_it_refuses(void) {
  CHECK(set_up());
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(evolu_database_open_memory(&database, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(database);
  sqlite3_stmt *statement = NULL;
  static const char second[] = "select 1; pragma foreign_keys = 1";

  // SQLite applies the pragma when it prepares it, so a second statement is
  // scanned, not prepared.
  int rc = evolu_database_prepare(database, second, strlen(second), &statement,
                                  &error);
  CHECK_EQ_INT(rc, SQLITE_MISUSE);
  CHECK(statement == NULL);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_MULTIPLE_STATEMENTS, SQLITE_MISUSE);
  CHECK_EQ_STR(error.message, "The SQL contains more than one statement.");
  evolu_database_clear_error(&error);
  // SQLite would read SQL only up to a NUL character.
  static const char with_nul[] = "pragma foreign_keys = 1\0; select 1";
  rc = evolu_database_prepare(database, with_nul, sizeof with_nul - 1,
                              &statement, &error);
  CHECK_EQ_INT(rc, SQLITE_MISUSE);
  CHECK(statement == NULL);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_INVALID_SQL_TEXT, SQLITE_MISUSE);
  CHECK_EQ_STR(error.message, "The SQL contains a NUL character.");
  evolu_database_clear_error(&error);

  CHECK_EQ_INT(query_int(db, "pragma foreign_keys"), 0);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_prepare_fails_with_sqlites_error_and_offset(void) {
  CHECK(set_up());
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(evolu_database_open_memory(&database, &error), SQLITE_OK);
  sqlite3_stmt *statement = NULL;
  // "kůň" takes 5 bytes, so nope is at byte 16.
  static const char missing[] = "select 'k\xc5\xaf\xc5\x88', nope";

  int rc = evolu_database_prepare(database, missing, strlen(missing),
                                  &statement, &error);

  CHECK_EQ_INT(rc, SQLITE_ERROR);
  CHECK(statement == NULL);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_ERROR);
  CHECK_EQ_STR(error.message, "no such column: nope");
  CHECK_EQ_INT(error.sql_offset, 16);
  evolu_database_clear_error(&error);

  // SQLite takes the size, with the NUL that follows it, as an int.
  rc = evolu_database_prepare(database, missing, INT_MAX, &statement, &error);
  CHECK_EQ_INT(rc, SQLITE_TOOBIG);
  CHECK(statement == NULL);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_TOOBIG);
  CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_TOOBIG));
  evolu_database_clear_error(&error);

  // A statement that prepares runs as SQLite prepared it.
  static const char select[] = "select 41 + 1; -- the answer";
  CHECK_EQ_INT(evolu_database_prepare(database, select, strlen(select),
                                      &statement, &error),
               SQLITE_OK);
  CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_NONE);
  CHECK_EQ_INT(sqlite3_step(statement), SQLITE_ROW);
  CHECK_EQ_INT(sqlite3_column_int(statement, 0), 42);
  CHECK_EQ_INT(sqlite3_finalize(statement), SQLITE_OK);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_prepare_fails_cleanly_when_allocations_fail(void) {
  CHECK(set_up());
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(evolu_database_open_memory(&database, &error), SQLITE_OK);
  static const char sql[] = "select 1 as a, 'x' as b union all select 2, 'y'";
  int failures = 0;
  for (int allowed = 0;; allowed++) {
    sqlite3_stmt *statement = NULL;
    test_sqlite_allocations_left = allowed;
    int rc = evolu_database_prepare(database, sql, strlen(sql), &statement,
                                    &error);
    int is_exhausted = test_sqlite_allocations_left == -2;
    test_sqlite_allocations_left = -1;
    if (!is_exhausted) {
      CHECK_EQ_INT(rc, SQLITE_OK);
      CHECK_EQ_INT(sqlite3_finalize(statement), SQLITE_OK);
      break;
    }
    CHECK_EQ_INT(rc & 0xff, SQLITE_NOMEM);
    CHECK(statement == NULL);
    CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_SQLITE);
    evolu_database_clear_error(&error);
    failures++;
  }
  CHECK(failures > 1);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

/* Writes path with suffix into file, which holds 600 bytes. */
static void sidecar_of(char file[600], const char *path, const char *suffix) {
  snprintf(file, 600, "%s%s", path, suffix);
}

static void binding_delete_removes_the_database_then_its_sidecars(void) {
  CHECK(set_up());
  static const char *const suffixes[] = {"", "-journal", "-wal", "-shm"};
  char path[512];
  path_of(path, "deleted.db");
  CHECK(create_database(path, test_key, 3));
  for (size_t i = 1; i < 4; i++) {
    char file[600];
    sidecar_of(file, path, suffixes[i]);
    CHECK(write_file(file, (const uint8_t *)"x", 1));
  }
  evolu_database_error error;

  CHECK_EQ_INT(delete_file(path, &error), SQLITE_OK);

  for (size_t i = 0; i < 4; i++) {
    char file[600];
    sidecar_of(file, path, suffixes[i]);
    CHECK(!file_exists(file));
  }
  CHECK_EQ_INT(is_open(path), 0);
  // Missing files are fine, also a missing database.
  CHECK(create_database(path, NULL, 1));
  CHECK_EQ_INT(delete_file(path, &error), SQLITE_OK);
  CHECK_EQ_INT(delete_file(path, &error), SQLITE_OK);
  CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_NONE);
}

static void binding_delete_refuses_a_held_file(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "held-delete.db");
  CHECK(create_database(path, test_key, 3));
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);

  CHECK_EQ_INT(delete_file(path, &error), SQLITE_BUSY);

  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_FILE_HELD, SQLITE_BUSY);
  CHECK(file_exists(path));
  CHECK_EQ_INT(count_rows(evolu_database_connection(database)), 3);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  CHECK_EQ_INT(delete_file(path, &error), SQLITE_OK);
  CHECK(!file_exists(path));
}

static void binding_delete_stops_at_a_file_it_cant_remove_with_errno(void) {
  CHECK(set_up());
  char path[512];
  char journal[600];
  char wal[600];
  char shm[600];
  char probe[512];
  path_of(path, "undeletable.db");
  path_of(probe, "undeletable-probe");
  sidecar_of(journal, path, "-journal");
  sidecar_of(wal, path, "-wal");
  sidecar_of(shm, path, "-shm");
  CHECK(create_database(path, NULL, 1));
  CHECK(write_file(journal, (const uint8_t *)"x", 1));
  CHECK(write_file(shm, (const uint8_t *)"x", 1));
  // unlink fails for a directory, with an errno the platform chooses.
  remove_tree(probe);
  CHECK_EQ_INT(mkdir(probe, 0700), 0);
  CHECK_EQ_INT(mkdir(wal, 0700), 0);
  CHECK_EQ_INT(unlink(probe), -1);
  int expected_errno = errno;
  evolu_database_error error;

  CHECK_EQ_INT(delete_file(path, &error), SQLITE_IOERR_DELETE);

  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_IOERR_DELETE);
  CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_IOERR_DELETE));
  CHECK_EQ_INT(error.system_errno, expected_errno);
  CHECK(!file_exists(path));
  CHECK(!file_exists(journal));
  CHECK(file_exists(wal));
  CHECK(file_exists(shm));
  CHECK_EQ_INT(is_open(path), 0);

  // A database that stays keeps its journal, which goes only after it.
  char directory_path[512];
  char directory_journal[600];
  path_of(directory_path, "undeletable-database.db");
  sidecar_of(directory_journal, directory_path, "-journal");
  remove_database(directory_path);
  CHECK_EQ_INT(mkdir(directory_path, 0700), 0);
  CHECK(write_file(directory_journal, (const uint8_t *)"x", 1));
  CHECK_EQ_INT(delete_file(directory_path, &error), SQLITE_IOERR_DELETE);
  CHECK_EQ_INT(error.system_errno, expected_errno);
  CHECK(file_exists(directory_path));
  CHECK(file_exists(directory_journal));
  remove_tree(probe);
  remove_database(path);
  remove_database(directory_path);
}

/*
 * Whether the export equals what sqlite3_serialize returns on the same
 * connection, but for page 1's change counter, schema cookie, version-valid-for
 * number and SQLite version number, which the backup's commit writes.
 */
static int exports_as_serialized(sqlite3 *db, const uint8_t *bytes,
                                 size_t size) {
  sqlite3_int64 serialized_size = 0;
  uint8_t *serialized = sqlite3_serialize(db, "main", &serialized_size, 0);
  int same = serialized != NULL && (size_t)serialized_size == size;
  for (size_t i = 0; same && i < size; i++)
    same = bytes[i] == serialized[i] || (i >= 24 && i < 28) ||
           (i >= 40 && i < 44) || (i >= 92 && i < 100);
  sqlite3_free(serialized);
  return same;
}

/* A connection to a copy of an export's bytes, in memory, or NULL. */
static sqlite3 *open_export(const uint8_t *bytes, size_t size) {
  sqlite3 *copy = NULL;
  uint8_t *data = sqlite3_malloc64(size);
  if (data != NULL) memcpy(data, bytes, size);
  if (data == NULL ||
      sqlite3_open_v2(":memory:", &copy,
                      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
                      NULL) != SQLITE_OK ||
      sqlite3_deserialize(copy, "main", data, (sqlite3_int64)size,
                          (sqlite3_int64)size,
                          SQLITE_DESERIALIZE_FREEONCLOSE) != SQLITE_OK) {
    sqlite3_close(copy);
    return NULL;
  }
  return copy;
}

static void binding_export_is_the_plaintext_database_serialize_reads(void) {
  CHECK(set_up());
  char encrypted[512];
  char plain[512];
  path_of(encrypted, "export.db");
  path_of(plain, "export-plain.db");
  CHECK(create_database(encrypted, test_key, 20));
  CHECK(create_database(plain, NULL, 20));
  const char *paths[] = {encrypted, plain};
  for (size_t i = 0; i < 2; i++) {
    evolu_database *database = NULL;
    evolu_database_error error;
    int rc = i == 0 ? open_encrypted(paths[i], test_key, &database, &error)
                    : open_plain(paths[i], &database, &error);
    CHECK_EQ_INT(rc, SQLITE_OK);
    sqlite3 *db = evolu_database_connection(database);
    CHECK_EQ_INT(sqlite3_exec(db, "create index t_v on t (v)", NULL, NULL,
                              NULL),
                 SQLITE_OK);
    uint8_t *bytes = NULL;
    size_t size = 0;

    CHECK_EQ_INT(evolu_database_export(database, &bytes, &size, &error),
                 SQLITE_OK);

    CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_NONE);
    CHECK_EQ_INT((long long)size, query_int(db, "pragma page_count") * 4096);
    CHECK(exports_as_serialized(db, bytes, size));
    sqlite3 *copy = open_export(bytes, size);
    evolu_database_free_export(bytes, size);
    CHECK(copy != NULL);
    CHECK_EQ_INT(count_rows(copy), 20);
    CHECK_EQ_INT(query_int(copy, "select count(*) from pragma_integrity_check "
                                 "where integrity_check = 'ok'"),
                 1);
    CHECK_EQ_INT(sqlite3_close(copy), SQLITE_OK);
    CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  }
}

static void binding_export_of_a_memory_database(void) {
  CHECK(set_up());
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(evolu_database_open_memory(&database, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(database);
  CHECK_EQ_INT(create_rows(db, 5), SQLITE_OK);
  uint8_t *bytes = NULL;
  size_t size = 0;

  CHECK_EQ_INT(evolu_database_export(database, &bytes, &size, &error),
               SQLITE_OK);

  CHECK(exports_as_serialized(db, bytes, size));
  evolu_database_free_export(bytes, size);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_export_of_an_empty_database_is_one_page_without_tables(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "export-empty.db");
  remove_database(path);
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  uint8_t *bytes = NULL;
  size_t size = 0;

  CHECK_EQ_INT(evolu_database_export(database, &bytes, &size, &error),
               SQLITE_OK);

  CHECK_EQ_INT(size, 4096);
  sqlite3 *copy = open_export(bytes, size);
  evolu_database_free_export(bytes, size);
  CHECK(copy != NULL);
  CHECK_EQ_INT(query_int(copy, "select count(*) from sqlite_schema"), 0);
  CHECK_EQ_INT(sqlite3_close(copy), SQLITE_OK);
  // The export wrote nothing to the file.
  struct stat status;
  CHECK_EQ_INT(stat(path, &status), 0);
  CHECK_EQ_INT(status.st_size, 0);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_export_in_a_write_transaction_fails_before_allocating(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "export-busy.db");
  CHECK(create_database(path, test_key, 3));
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(database);
  CHECK_EQ_INT(sqlite3_exec(db, "begin; delete from t where id = 1", NULL,
                            NULL, NULL),
               SQLITE_OK);
  uint8_t *bytes = NULL;
  size_t size = 0;

  // Any allocation would fail with SQLITE_NOMEM.
  test_sqlite_allocations_left = 0;
  evolu_test_allocations_left = 0;
  int rc = evolu_database_export(database, &bytes, &size, &error);
  test_sqlite_allocations_left = -1;
  evolu_test_allocations_left = -1;

  CHECK_EQ_INT(rc, SQLITE_BUSY);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_BUSY);
  CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_BUSY));
  CHECK(bytes == NULL);
  CHECK_EQ_INT(sqlite3_txn_state(db, "main"), SQLITE_TXN_WRITE);
  CHECK_EQ_INT(sqlite3_exec(db, "commit", NULL, NULL, NULL), SQLITE_OK);
  CHECK_EQ_INT(count_rows(db), 2);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_export_of_tampered_pages_fails_as_on_the_web(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "export-tampered.db");
  CHECK(create_database(path, test_key, 20));
  evolu_database *database = NULL;
  evolu_database_error error;
  uint8_t *bytes = NULL;
  size_t size = 0;

  // The page_count pragma's read transaction reads page 1 again.
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  CHECK(flip_bit(path, 200));
  CHECK_EQ_INT(evolu_database_export(database, &bytes, &size, &error),
               SQLITE_NOTADB);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_NOTADB);
  CHECK_EQ_INT(error.codec_failure.type,
               EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION);
  CHECK_EQ_INT(error.codec_failure.page_number, 1);
  CHECK_EQ_INT(error.system_errno, 0);
  CHECK(bytes == NULL);
  evolu_database_clear_error(&error);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  CHECK(flip_bit(path, 200));

  // A page the connection hasn't cached, which the backup reads.
  CHECK(flip_bit(path, 4 * 4096 + 200));
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  CHECK_EQ_INT(evolu_database_export(database, &bytes, &size, &error),
               SQLITE_CORRUPT);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CORRUPT);
  CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_CORRUPT));
  CHECK_EQ_INT(error.codec_failure.type,
               EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION);
  CHECK_EQ_INT(error.codec_failure.page_number, 5);
  CHECK_EQ_INT(error.system_errno, 0);
  evolu_database_clear_error(&error);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_export_of_a_read_that_fails_has_its_files_errno(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "export-faults.db");
  CHECK(create_database(path, test_key, 20));
  evolu_test_database_vfs = fault_codec_vfs_name;
  evolu_test_plain_vfs = fault_vfs_name;
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(database);
  uint8_t *bytes = NULL;
  size_t size = 0;

  // The backup's read of page 3, which only it reads.
  arm_fault(1, 1, 2 * 4096);
  CHECK_EQ_INT(evolu_database_export(database, &bytes, &size, &error),
               SQLITE_IOERR_READ);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_IOERR_READ);
  CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_IOERR_READ));
  CHECK_EQ_INT(error.system_errno, fault_file_errno);
  CHECK_EQ_INT(error.codec_failure.type, EVOLU_DATABASE_CODEC_FAILURE_NONE);
  evolu_database_clear_error(&error);

  // The page_count pragma's read of page 1, a statement on the connection.
  arm_fault(1, 1, 0);
  CHECK_EQ_INT(evolu_database_export(database, &bytes, &size, &error),
               SQLITE_IOERR_READ);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_IOERR_READ);
  CHECK_EQ_STR(error.message, sqlite3_errmsg(db));
  CHECK_EQ_INT(error.system_errno, sqlite3_system_errno(db));
  CHECK_EQ_INT(error.system_errno, fault_thread_errno);
  evolu_database_clear_error(&error);
  arm_fault(0, 0, 0);

  CHECK_EQ_INT(evolu_database_export(database, &bytes, &size, &error),
               SQLITE_OK);
  evolu_database_free_export(bytes, size);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

/* The allocations the hooks record: the export's buffer, by its size. */
static int buffer_size;
static void *buffer;
static int is_buffer_reallocated;
static int is_buffer_freed;
static int is_buffer_wiped;

static void record_malloc(void *p, int size) {
  if (size == buffer_size && buffer == NULL) buffer = p;
}

static void record_realloc(void *p, int size) {
  (void)size;
  if (p != NULL && p == buffer) is_buffer_reallocated = 1;
}

static void record_free(void *p, int size) {
  if (p != buffer) return;
  is_buffer_freed = 1;
  // The allocator's size may be rounded up past what was asked for.
  is_buffer_wiped = size >= buffer_size;
  for (int i = 0; i < buffer_size; i++)
    if (((uint8_t *)p)[i] != 0) is_buffer_wiped = 0;
}

static void record_buffer_of(int size) {
  buffer_size = size;
  buffer = NULL;
  is_buffer_reallocated = 0;
  is_buffer_freed = 0;
  is_buffer_wiped = 0;
  test_sqlite_malloc_hook = record_malloc;
  test_sqlite_realloc_hook = record_realloc;
  test_sqlite_free_hook = record_free;
}

static void binding_export_hands_over_one_buffer_and_frees_it_wiped(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "export-buffer.db");
  CHECK(create_database(path, test_key, 20));
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(database);
  int pages = (int)query_int(db, "pragma page_count");
  uint8_t *bytes = NULL;
  size_t size = 0;
  record_buffer_of(pages * 4096);

  CHECK_EQ_INT(evolu_database_export(database, &bytes, &size, &error),
               SQLITE_OK);

  CHECK(buffer != NULL);
  CHECK(bytes == buffer);
  CHECK_EQ_INT(size, pages * 4096);
  CHECK(!is_buffer_reallocated);
  CHECK(!is_buffer_freed);
  CHECK(contains(bytes, size, secret, sizeof secret - 1));
  evolu_database_free_export(bytes, size);
  CHECK(is_buffer_freed);
  CHECK(is_buffer_wiped);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_failed_export_wipes_the_pages_the_copy_spilled(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "export-spilled.db");
  // More pages than the copy's default cache holds, about 470.
  CHECK(create_database(path, test_key, 700));
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  int pages = (int)query_int(evolu_database_connection(database),
                             "pragma page_count");
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  CHECK(flip_bit(path, (size_t)(pages - 1) * 4096 + 200));
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  uint8_t *bytes = NULL;
  size_t size = 0;
  record_buffer_of(pages * 4096);

  CHECK_EQ_INT(evolu_database_export(database, &bytes, &size, &error),
               SQLITE_CORRUPT);

  CHECK_EQ_INT(error.codec_failure.page_number, pages);
  evolu_database_clear_error(&error);
  CHECK(buffer != NULL);
  CHECK(is_buffer_freed);
  CHECK(is_buffer_wiped);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

/*
 * Another connection to the database, which bypasses the registry, runs
 * other_sql when the export allocates its buffer, after the pragmas that size
 * it and before the backup.
 */
static sqlite3 *other;
static const char *other_sql;
static int other_rc;

static void change_database_at_buffer(void *p, int size) {
  if (size != buffer_size || other_sql == NULL) return;
  buffer = p;
  const char *sql = other_sql;
  other_sql = NULL;
  other_rc = sqlite3_exec(other, sql, NULL, NULL, NULL);
}

static void binding_export_fails_when_the_database_changes_meanwhile(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "export-changed.db");
  static const char *const changes[] = {
      "delete from t where id > 5; vacuum",
      "insert into t select id + 100, v from t",
  };
  for (size_t i = 0; i < 2; i++) {
    CHECK(create_database(path, test_key, 20));
    evolu_database *database = NULL;
    evolu_database_error error;
    CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
    sqlite3 *db = evolu_database_connection(database);
    CHECK_EQ_INT(evolu_codec_open(path, &other, "evolu-codec", test_key,
                                  EVOLU_CODEC_SQLCIPHER_FILES),
                 SQLITE_OK);
    record_buffer_of((int)query_int(db, "pragma page_count") * 4096);
    test_sqlite_malloc_hook = change_database_at_buffer;
    other_sql = changes[i];
    other_rc = -1;
    uint8_t *bytes = NULL;
    size_t size = 0;

    int rc = evolu_database_export(database, &bytes, &size, &error);

    test_sqlite_malloc_hook = NULL;
    CHECK_EQ_INT(other_rc, SQLITE_OK);
    CHECK(is_buffer_freed);
    CHECK(is_buffer_wiped);
    CHECK(bytes == NULL);
    if (i == 0) {
      // Fewer pages than the buffer holds.
      CHECK_EQ_INT(rc, SQLITE_BUSY);
      CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_BUSY);
      CHECK_EQ_STR(error.message,
                   "The database changed while it was exported.");
    } else {
      // More than it holds, which the copy can't grow beyond.
      CHECK_EQ_INT(rc, SQLITE_FULL);
      CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_FULL);
      CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_FULL));
    }
    evolu_database_clear_error(&error);
    CHECK_EQ_INT(sqlite3_close(other), SQLITE_OK);
    CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
  }
}

/*
 * Exporting, with SQLite's allocations failing from the n-th on for every n
 * until one exports whole, fails with SQLITE_NOMEM, frees the buffer wiped
 * when it was allocated, and leaves the connection to export again. An export
 * after the open makes none of the core's own allocations.
 */
static void binding_export_fails_cleanly_when_allocations_fail(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "export-allocations.db");
  CHECK(create_database(path, test_key, 20));
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  int pages = (int)query_int(evolu_database_connection(database),
                             "pragma page_count");
  int failures = 0;
  for (int allowed = 0;; allowed++) {
    uint8_t *bytes = NULL;
    size_t size = 0;
    record_buffer_of(pages * 4096);
    test_sqlite_allocations_left = allowed;
    int rc = evolu_database_export(database, &bytes, &size, &error);
    int is_exhausted = test_sqlite_allocations_left == -2;
    test_sqlite_allocations_left = -1;
    if (!is_exhausted) {
      CHECK_EQ_INT(rc, SQLITE_OK);
      evolu_database_free_export(bytes, size);
      break;
    }
    CHECK_EQ_INT(rc & 0xff, SQLITE_NOMEM);
    CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_SQLITE);
    CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_NOMEM));
    CHECK(bytes == NULL);
    CHECK(buffer == NULL || (is_buffer_freed && is_buffer_wiped));
    evolu_database_clear_error(&error);
    failures++;
  }
  CHECK(failures > 3);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

/*
 * Exporting through every call of the inner VFS's files failing in turn fails
 * with an I/O error and no codec failure, frees the buffer wiped when it was
 * allocated, and leaves the connection to export again.
 */
static void binding_export_fails_cleanly_whichever_inner_call_fails(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "export-inner-faults.db");
  CHECK(create_database(path, test_key, 20));
  evolu_test_database_vfs = fault_codec_vfs_name;
  evolu_test_plain_vfs = fault_vfs_name;
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  int pages = (int)query_int(evolu_database_connection(database),
                             "pragma page_count");
  int failures = 0;
  for (int at = 1;; at++) {
    uint8_t *bytes = NULL;
    size_t size = 0;
    record_buffer_of(pages * 4096);
    arm_fault(at, 0, 0);
    int rc = evolu_database_export(database, &bytes, &size, &error);
    int is_reached = fault_calls >= at;
    arm_fault(0, 0, 0);
    if (!is_reached) {
      CHECK_EQ_INT(rc, SQLITE_OK);
      evolu_database_free_export(bytes, size);
      break;
    }
    CHECK_EQ_INT(rc & 0xff, SQLITE_IOERR);
    CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_SQLITE);
    CHECK_EQ_INT(error.codec_failure.type, EVOLU_DATABASE_CODEC_FAILURE_NONE);
    CHECK(bytes == NULL);
    CHECK(buffer == NULL || (is_buffer_freed && is_buffer_wiped));
    evolu_database_clear_error(&error);
    failures++;
  }
  // At least the pragma's read and a backup's, which the connection's cache
  // keeps from earlier exports.
  CHECK(failures > 1);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

/*
 * Opening a database, encrypted or plain, with the hot journal of a crash,
 * through every call of the inner VFS's files failing in turn, then every
 * allocation of SQLite's and of the core's, fails or opens, and a failed open
 * holds no entry and leaves the database to open whole with its rows as they
 * were.
 */
static void binding_open_fails_cleanly_whichever_call_or_allocation_fails(
    void) {
  CHECK(set_up());
  char base[512];
  char path[512];
  path_of(base, "open-faults-base.db");
  path_of(path, "open-faults.db");
  char base_journal[600];
  char journal[600];
  snprintf(base_journal, sizeof base_journal, "%s-journal", base);
  snprintf(journal, sizeof journal, "%s-journal", path);
  const uint8_t *keys[] = {test_key, NULL};
  for (size_t k = 0; k < 2; k++) {
    const uint8_t *key = keys[k];
    CHECK(create_crashed_database(base, key, 20));
    for (int kind = 0; kind < 3; kind++) {
      int failures = 0;
      for (int at = kind == 0 ? 1 : 0;; at++) {
        remove_database(path);
        CHECK(copy_file(base, path) && copy_file(base_journal, journal));
        evolu_test_database_vfs = fault_codec_vfs_name;
        evolu_test_plain_vfs = fault_vfs_name;
  evolu_test_plain_vfs = fault_vfs_name;
        if (kind == 0) arm_fault(at, 0, 0);
        else if (kind == 1) test_sqlite_allocations_left = at;
        else evolu_test_allocations_left = at;
        evolu_database *database = NULL;
        evolu_database_error error;
        int rc = key != NULL ? open_encrypted(path, key, &database, &error)
                             : open_plain(path, &database, &error);
        int is_reached = kind == 0   ? fault_calls >= at
                         : kind == 1 ? test_sqlite_allocations_left == -2
                                     : evolu_test_allocations_left == -2;
        reset_hooks();
        arm_fault(0, 0, 0);
        if (rc == SQLITE_OK) {
          // A fault SQLite tolerated leaves every row, too.
          CHECK_EQ_INT(count_rows(evolu_database_connection(database)), 20);
          CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
          CHECK(!is_reached || kind == 0);
          if (!is_reached) break;
          continue;
        }
        CHECK(is_reached);
        // An allocation that fails, SQLite's or the core's, fails the open
        // with SQLITE_NOMEM.
        if (kind != 0) CHECK_EQ_INT(rc & 0xff, SQLITE_NOMEM);
        CHECK(database == NULL);
        CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_SQLITE);
        CHECK(error.message != NULL);
        // A failure of SQLite's or of the codec's, never one of the key's.
        CHECK(error.codec_failure.type !=
              EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION);
        evolu_database_clear_error(&error);
        CHECK_EQ_INT(is_open(path), 0);
        int ok = key != NULL ? open_encrypted(path, key, &database, &error)
                             : open_plain(path, &database, &error);
        CHECK_EQ_INT(ok, SQLITE_OK);
        CHECK_EQ_INT(count_rows(evolu_database_connection(database)), 20);
        CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
        failures++;
      }
      // A plain open allocates nothing of the core's own.
      CHECK(failures > 0 || (key == NULL && kind == 2));
    }
  }
  remove_database(base);
  remove_database(path);
}

static void binding_path_functions_fail_with_nomem_when_allocations_fail(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "path-allocations.db");
  CHECK(create_database(path, NULL, 1));
  for (int function = 0; function < 4; function++) {
    evolu_database_error error;
    test_sqlite_allocations_left = 0;
    int rc = path_function(function, path, strlen(path), &error);
    test_sqlite_allocations_left = -1;
    CHECK_EQ_INT(rc, SQLITE_NOMEM);
    CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_NOMEM);
    CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_NOMEM));
    CHECK_EQ_INT(is_open(path), 0);
  }
  CHECK(file_exists(path));
}

static void binding_error_carries_errno_only_from_the_error_itself(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "errno.db");
  CHECK(create_database(path, NULL, 20));
  // A b-tree page that isn't one: SQLite's own SQLITE_CORRUPT, without a
  // codec failure.
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  CHECK(bytes != NULL && size > 6 * 4096);
  memset(bytes + 5 * 4096, 0, 4096);
  CHECK(write_file(path, bytes, size));
  free(bytes);
  evolu_test_database_vfs = fault_codec_vfs_name;
  evolu_test_plain_vfs = fault_vfs_name;
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_plain(path, &database, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(database);

  arm_fault(1, 1, 4096);
  evolu_database_discard_failure(db);
  int rc = sqlite3_exec(db, "select sum(length(v)) from t", NULL, NULL, NULL);
  arm_fault(0, 0, 0);
  CHECK_EQ_INT(rc, SQLITE_IOERR_READ);
  evolu_database_set_error(&error, db, rc);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_IOERR_READ);
  CHECK_EQ_INT(error.system_errno, fault_thread_errno);
  evolu_database_clear_error(&error);

  evolu_database_discard_failure(db);
  rc = sqlite3_exec(db, "select sum(length(v)) from t", NULL, NULL, NULL);
  CHECK_EQ_INT(rc, SQLITE_CORRUPT);
  evolu_database_set_error(&error, db, rc);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CORRUPT);
  CHECK_EQ_STR(error.message, sqlite3_errmsg(db));
  // SQLite keeps the errno of the earlier error.
  CHECK_EQ_INT(sqlite3_system_errno(db), fault_thread_errno);
  CHECK_EQ_INT(error.system_errno, 0);
  evolu_database_clear_error(&error);

  // Nor from SQLite's out-of-memory I/O error, which records none, while the
  // connection still holds the earlier one.
  evolu_database_set_error(&error, db, SQLITE_IOERR_NOMEM);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_IOERR_NOMEM);
  CHECK_EQ_INT(error.system_errno, 0);
  evolu_database_clear_error(&error);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);

}

static void binding_failure_an_earlier_call_left_never_becomes_a_cause(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "stale-failure.db");
  CHECK(create_database(path, test_key, 20));
  CHECK(flip_bit(path, 4 * 4096 + 200));
  evolu_test_database_vfs = fault_codec_vfs_name;
  evolu_test_plain_vfs = fault_vfs_name;
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(open_encrypted(path, test_key, &database, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(database);
  // A step that fails at the altered page, whose failure stays recorded.
  CHECK_EQ_INT(sqlite3_exec(db, "select sum(length(v)) from t", NULL, NULL,
                            NULL),
               SQLITE_CORRUPT);

  evolu_database_discard_failure(db);
  int rc = sqlite3_exec(db, "select * frm t", NULL, NULL, NULL);
  evolu_database_set_error(&error, db, rc);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_ERROR);
  CHECK_EQ_STR(error.message, sqlite3_errmsg(db));
  CHECK(error.sql_offset > 0);
  CHECK_EQ_INT(error.sql_offset, sqlite3_error_offset(db));
  CHECK_EQ_INT(error.codec_failure.type, EVOLU_DATABASE_CODEC_FAILURE_NONE);
  evolu_database_clear_error(&error);

  // Nor in a prepare, which discards it first.
  CHECK_EQ_INT(sqlite3_exec(db, "select sum(length(v)) from t", NULL, NULL,
                            NULL),
               SQLITE_CORRUPT);
  sqlite3_stmt *statement = NULL;
  static const char misspelled[] = "select * frm t";
  rc = evolu_database_prepare(database, misspelled, strlen(misspelled),
                              &statement, &error);
  CHECK_EQ_INT(rc, SQLITE_ERROR);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_ERROR);
  CHECK_EQ_INT(error.codec_failure.type, EVOLU_DATABASE_CODEC_FAILURE_NONE);
  evolu_database_clear_error(&error);

  // Nor in an export, which discards it first, whose pragma then fails.
  CHECK_EQ_INT(sqlite3_exec(db, "select sum(length(v)) from t", NULL, NULL,
                            NULL),
               SQLITE_CORRUPT);
  uint8_t *bytes = NULL;
  size_t size = 0;
  arm_fault(1, 1, 0);
  rc = evolu_database_export(database, &bytes, &size, &error);
  arm_fault(0, 0, 0);
  CHECK_EQ_INT(rc, SQLITE_IOERR_READ);
  CHECK_EQ_INT(error.codec_failure.type, EVOLU_DATABASE_CODEC_FAILURE_NONE);
  evolu_database_clear_error(&error);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_error_message_is_sqlites_for_its_code_or_errstr(void) {
  CHECK(set_up());
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(evolu_database_open_memory(&database, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(database);
  int rc = sqlite3_exec(db, "select * from missing", NULL, NULL, NULL);
  CHECK_EQ_INT(rc, SQLITE_ERROR);

  // A code the connection didn't record has errstr's message and no offset.
  evolu_database_set_error(&error, db, SQLITE_ABORT);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_ABORT);
  CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_ABORT));
  CHECK_EQ_INT(error.sql_offset, -1);
  evolu_database_clear_error(&error);

  // A message it can't copy falls back to errstr's.
  test_sqlite_allocations_left = 0;
  evolu_database_set_error(&error, db, rc);
  test_sqlite_allocations_left = -1;
  CHECK_EQ_STR(error.message, sqlite3_errstr(SQLITE_ERROR));
  evolu_database_clear_error(&error);
  evolu_database_set_error(&error, db, rc);
  CHECK_EQ_STR(error.message, "no such table: missing");
  evolu_database_clear_error(&error);
  // Clearing again, or an error that was never set, does nothing.
  evolu_database_clear_error(&error);
  CHECK_EQ_INT(error.type, EVOLU_DATABASE_ERROR_NONE);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_error_offset_is_only_a_parser_errors(void) {
  CHECK(set_up());
  evolu_database *database = NULL;
  evolu_database_error error;
  CHECK_EQ_INT(evolu_database_open_memory(&database, &error), SQLITE_OK);
  sqlite3 *db = evolu_database_connection(database);
  sqlite3_stmt *statement = NULL;
  sqlite3_stmt *failed = NULL;
  CHECK_EQ_INT(sqlite3_prepare_v2(db, "select ?", -1, &statement, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_prepare_v2(db, "select * frm t", -1, &failed, NULL),
               SQLITE_ERROR);

  int rc = sqlite3_bind_int(statement, 99, 1);

  CHECK_EQ_INT(rc, SQLITE_RANGE);
  // SQLite keeps the offset of the earlier error.
  CHECK_EQ_INT(sqlite3_error_offset(db), 9);
  evolu_database_set_error(&error, db, rc);
  CHECK_ERROR(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_RANGE);
  CHECK_EQ_STR(error.message, sqlite3_errmsg(db));
  CHECK_EQ_INT(error.sql_offset, -1);
  evolu_database_clear_error(&error);
  CHECK_EQ_INT(sqlite3_finalize(statement), SQLITE_OK);
  CHECK_EQ_INT(evolu_database_close(database), SQLITE_OK);
}

static void binding_random_bytes_fill_or_fail(void) {
  CHECK(set_up());
  uint8_t bytes[64] = {0};
  uint8_t zeros[64] = {0};

  CHECK_EQ_INT(evolu_database_random_bytes(bytes, sizeof bytes), SQLITE_OK);
  CHECK(memcmp(bytes, zeros, sizeof bytes) != 0);

  evolu_test_random_fails = 1;
  CHECK_EQ_INT(evolu_database_random_bytes(bytes, sizeof bytes), SQLITE_ERROR);
  evolu_test_random_fails = 0;
}

static void binding_wipe_zeroes_exactly_the_bytes_it_gets(void) {
  uint8_t bytes[40];
  memset(bytes, 0xa5, sizeof bytes);

  evolu_database_wipe(bytes + 4, 32);

  CHECK_EQ_INT(bytes[3], 0xa5);
  CHECK_EQ_INT(bytes[36], 0xa5);
  static const uint8_t zeros[32] = {0};
  CHECK_EQ_BYTES(bytes + 4, zeros, sizeof zeros);
}

/* The path the thread tests open, and what their threads saw. */
static char threads_path[512];
static atomic_int holders;
static atomic_int overlaps;
static atomic_int opens;
static atomic_int other_failures;

static void *open_and_close_in_a_loop(void *unused) {
  (void)unused;
  for (int i = 0; i < 300; i++) {
    evolu_database *database = NULL;
    evolu_database_error error;
    if (open_plain(threads_path, &database, &error) != SQLITE_OK) {
      if (error.type != EVOLU_DATABASE_ERROR_FILE_HELD)
        atomic_fetch_add(&other_failures, 1);
      evolu_database_clear_error(&error);
      continue;
    }
    // Held from the open until just before the close, with a query between.
    if (atomic_fetch_add(&holders, 1) != 0) atomic_fetch_add(&overlaps, 1);
    atomic_fetch_add(&opens, 1);
    if (query_int(evolu_database_connection(database),
                  "select count(*) from t") != 1)
      atomic_fetch_add(&other_failures, 1);
    atomic_fetch_sub(&holders, 1);
    if (evolu_database_close(database) != SQLITE_OK)
      atomic_fetch_add(&other_failures, 1);
  }
  return NULL;
}

static void binding_threads_never_both_hold_one_path(void) {
  CHECK(set_up());
  path_of(threads_path, "threads.db");
  CHECK(create_database(threads_path, NULL, 1));
  atomic_store(&holders, 0);
  atomic_store(&overlaps, 0);
  atomic_store(&opens, 0);
  atomic_store(&other_failures, 0);
  pthread_t threads[2];

  for (int i = 0; i < 2; i++)
    CHECK_EQ_INT(pthread_create(&threads[i], NULL, open_and_close_in_a_loop,
                                NULL),
                 0);
  for (int i = 0; i < 2; i++) CHECK_EQ_INT(pthread_join(threads[i], NULL), 0);

  CHECK_EQ_INT(atomic_load(&overlaps), 0);
  CHECK_EQ_INT(atomic_load(&other_failures), 0);
  CHECK(atomic_load(&opens) > 0);
  CHECK_EQ_INT(is_open(threads_path), 0);
}

static int held_rc;

static void *open_and_close(void *path) {
  evolu_database *database = NULL;
  evolu_database_error error;
  held_rc = open_plain(path, &database, &error);
  if (held_rc == SQLITE_OK) held_rc = evolu_database_close(database);
  evolu_database_clear_error(&error);
  return NULL;
}

/* What another thread sees while the open is in flight, once it's checked. */
static const char *in_flight_path;
static const char *other_file_path;
static int in_flight_is_open;
static int other_file_rc;
static int is_checked;

static void *check_while_in_flight(void *unused) {
  (void)unused;
  in_flight_is_open = is_open(in_flight_path);
  evolu_database *database = NULL;
  evolu_database_error error;
  other_file_rc = open_plain(other_file_path, &database, &error);
  if (other_file_rc == SQLITE_OK)
    other_file_rc = evolu_database_close(database);
  evolu_database_clear_error(&error);
  pthread_mutex_lock(&hold_mutex);
  is_checked = 1;
  pthread_cond_broadcast(&hold_changed);
  pthread_mutex_unlock(&hold_mutex);
  return NULL;
}

/* Waits until *flag is set or the deadline passes, and returns the flag. */
static int wait_for(const int *flag, const struct timespec *deadline) {
  pthread_mutex_lock(&hold_mutex);
  int rc = 0;
  while (!*flag && rc != ETIMEDOUT)
    rc = pthread_cond_timedwait(&hold_changed, &hold_mutex, deadline);
  int is_set = *flag;
  pthread_mutex_unlock(&hold_mutex);
  return is_set;
}

/*
 * An open holds the registry's mutex only to check and add its entry, not
 * while SQLite opens and reads the file, which can take long, as for a large
 * hot journal: with an open held in its first read, another thread finds the
 * file held and opens and closes another file. That thread does it, so a
 * thread waiting for the mutex fails the test after 5 s rather than hanging it.
 */
static void binding_threads_open_another_file_while_an_open_is_in_flight(
    void) {
  CHECK(set_up());
  char path[512];
  char other_path[512];
  path_of(path, "threads-held.db");
  path_of(other_path, "threads-other.db");
  CHECK(create_database(path, NULL, 1));
  CHECK(create_database(other_path, NULL, 1));
  evolu_test_database_vfs = fault_codec_vfs_name;
  evolu_test_plain_vfs = fault_vfs_name;
  in_flight_path = path;
  other_file_path = other_path;
  is_read_held = 1;
  is_holding = 0;
  is_released = 0;
  is_checked = 0;
  held_rc = -1;
  struct timespec deadline;
  clock_gettime(CLOCK_REALTIME, &deadline);
  deadline.tv_sec += 5;
  pthread_t opener;
  pthread_t checker;
  CHECK_EQ_INT(pthread_create(&opener, NULL, open_and_close, path), 0);

  int is_in_flight = wait_for(&is_holding, &deadline);
  int has_checker =
      is_in_flight &&
      pthread_create(&checker, NULL, check_while_in_flight, NULL) == 0;
  int is_free = has_checker && wait_for(&is_checked, &deadline);

  // Released after a timeout too, so both threads end.
  pthread_mutex_lock(&hold_mutex);
  is_released = 1;
  pthread_cond_broadcast(&hold_changed);
  pthread_mutex_unlock(&hold_mutex);
  CHECK_EQ_INT(pthread_join(opener, NULL), 0);
  if (has_checker) CHECK_EQ_INT(pthread_join(checker, NULL), 0);
  if (!is_in_flight) {
    test_fail(__FILE__, __LINE__, "the open never reached its first read");
    return;
  }
  if (!is_free) {
    test_fail(__FILE__, __LINE__,
              "another thread waited 5 s for the registry while an open was "
              "in flight");
    return;
  }
  CHECK_EQ_INT(in_flight_is_open, 1);
  CHECK_EQ_INT(other_file_rc, SQLITE_OK);
  CHECK_EQ_INT(held_rc, SQLITE_OK);
  CHECK_EQ_INT(is_open(path), 0);
}

void binding_suite(void) {
  RUN(binding_check_build_registers_the_codec_vfs_over_the_default);
  RUN(binding_check_build_refuses_sqlite_without_the_core_options);
  RUN(binding_check_build_fails_when_another_vfs_has_the_name);
  RUN(binding_opens_memory_databases_each_its_own_with_core_functions);
  RUN(binding_opens_plain_and_encrypted_files);
  RUN(binding_closes_a_database_whose_skiplist_functions_ran);
  RUN(binding_databases_are_defensive);
  RUN(binding_opens_a_plain_file_with_plain_sqlite_on_the_default_vfs);
  RUN(binding_plain_open_refuses_keying_pragmas_with_sqlite_auth);
  RUN(binding_plain_open_attaches_databases_read_only);
  RUN(binding_plain_and_encrypted_opens_share_the_registry);
  RUN(binding_plain_open_of_an_encrypted_file_fails_with_notadb);
  RUN(binding_plain_open_fails_cleanly_when_allocations_fail);
  RUN(binding_encrypted_open_refuses_a_null_key);
  RUN(binding_wrong_key_and_wrong_mode_fail_as_not_a_database);
  RUN(binding_opens_a_file_in_sqlciphers_layout);
  RUN(binding_open_creates_a_missing_directory_with_mode_0700);
  RUN(binding_open_in_a_missing_parent_fails_with_cantopen_and_errno);
  RUN(binding_open_fails_with_cantopen_when_it_cant_create_the_file);
  RUN(binding_path_functions_refuse_a_path_that_names_no_file);
  RUN(binding_open_refuses_a_database_path_that_is_a_symbolic_link);
  RUN(binding_path_too_long_for_a_directory_or_name_fails_with_cantopen);
  RUN(binding_directory_that_doesnt_resolve_fails_with_cantopen);
  RUN(binding_directory_that_doesnt_exist_holds_no_file);
  RUN(binding_held_file_refuses_a_second_open_and_touches_no_file);
  RUN(binding_close_and_failed_opens_release_only_their_own_entries);
  RUN(binding_path_through_a_symlinked_directory_is_the_same_entry);
  RUN(binding_registry_holds_a_file_under_a_hard_link_too);
  RUN(binding_registry_holds_a_file_under_any_case_where_case_is_ignored);
  RUN(binding_registry_holds_several_files_and_releases_each_its_own);
  RUN(binding_open_of_a_directory_fails_with_sqlites_cantopen_and_errno);
  RUN(binding_open_on_a_vfs_that_isnt_a_codec_vfs_fails_with_misuse);
  RUN(binding_memory_open_fails_cleanly_when_allocations_fail);
  RUN(binding_close_finalizes_the_statements_sqlite_holds);
  RUN(binding_close_keeps_the_entry_while_sqlite_cant_close);
  RUN(binding_prepare_takes_one_statement_and_what_sqlite_skips_after_it);
  RUN(binding_prepare_refuses_sql_without_a_statement);
  RUN(binding_prepare_never_runs_what_it_refuses);
  RUN(binding_prepare_fails_with_sqlites_error_and_offset);
  RUN(binding_prepare_fails_cleanly_when_allocations_fail);
  RUN(binding_delete_removes_the_database_then_its_sidecars);
  RUN(binding_delete_refuses_a_held_file);
  RUN(binding_delete_stops_at_a_file_it_cant_remove_with_errno);
  RUN(binding_export_is_the_plaintext_database_serialize_reads);
  RUN(binding_export_of_a_memory_database);
  RUN(binding_export_of_an_empty_database_is_one_page_without_tables);
  RUN(binding_export_in_a_write_transaction_fails_before_allocating);
  RUN(binding_export_of_tampered_pages_fails_as_on_the_web);
  RUN(binding_export_of_a_read_that_fails_has_its_files_errno);
  RUN(binding_export_hands_over_one_buffer_and_frees_it_wiped);
  RUN(binding_failed_export_wipes_the_pages_the_copy_spilled);
  RUN(binding_export_fails_when_the_database_changes_meanwhile);
  RUN(binding_export_fails_cleanly_when_allocations_fail);
  RUN(binding_export_fails_cleanly_whichever_inner_call_fails);
  RUN(binding_open_fails_cleanly_whichever_call_or_allocation_fails);
  RUN(binding_path_functions_fail_with_nomem_when_allocations_fail);
  RUN(binding_error_carries_errno_only_from_the_error_itself);
  RUN(binding_failure_an_earlier_call_left_never_becomes_a_cause);
  RUN(binding_error_message_is_sqlites_for_its_code_or_errstr);
  RUN(binding_error_offset_is_only_a_parser_errors);
  RUN(binding_random_bytes_fill_or_fail);
  RUN(binding_wipe_zeroes_exactly_the_bytes_it_gets);
  RUN(binding_threads_never_both_hold_one_path);
  RUN(binding_threads_open_another_file_while_an_open_is_in_flight);
  // Also when a test failed or a filter skipped every test that created files.
  if (binding_vfs != NULL) reset_hooks();
  if (directory[0] != '\0') {
    remove_tree(directory);
    directory[0] = '\0';
  }
}
