/* The native binding layer; evolu_database.h describes it. */
// lstat, mkdir, open with O_CLOEXEC and unlink, which strict ISO C hides.
#define _POSIX_C_SOURCE 200809L

#include "evolu_database.h"

#include "evolu_codec.h"
#include "evolu_crypto.h"

#include <errno.h>
#include <fcntl.h>
#include <stddef.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

// The header declares the codec's failure itself, for adapters that see no
// other header of the core.
_Static_assert(sizeof(evolu_database_codec_failure) ==
                   sizeof(evolu_codec_failure),
               "evolu_database_codec_failure is evolu_codec_failure's size");
_Static_assert(offsetof(evolu_database_codec_failure, type) ==
                   offsetof(evolu_codec_failure, type),
               "evolu_database_codec_failure's type is evolu_codec_failure's");
_Static_assert(offsetof(evolu_database_codec_failure, page_number) ==
                   offsetof(evolu_codec_failure, page_number),
               "evolu_database_codec_failure's page number is "
               "evolu_codec_failure's");
_Static_assert((int)EVOLU_DATABASE_CODEC_FAILURE_NONE ==
                       (int)EVOLU_CODEC_FAILURE_NONE &&
                   (int)EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION ==
                       (int)EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION &&
                   (int)EVOLU_DATABASE_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED ==
                       (int)EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED &&
                   (int)EVOLU_DATABASE_CODEC_FAILURE_RANDOM ==
                       (int)EVOLU_CODEC_FAILURE_RANDOM,
               "evolu_database_codec_failure_type has evolu_codec.h's values");
_Static_assert(EVOLU_DATABASE_KEY_SIZE == EVOLU_CODEC_KEY_SIZE,
               "EVOLU_DATABASE_KEY_SIZE is EVOLU_CODEC_KEY_SIZE");

#ifdef EVOLU_TEST_HOOKS
int (*evolu_test_threadsafe)(void) = sqlite3_threadsafe;
int (*evolu_test_compileoption_used)(const char *name) =
    sqlite3_compileoption_used;
const char *evolu_test_database_vfs = "evolu-codec";
#define BUILD_THREADSAFE evolu_test_threadsafe
#define BUILD_OPTION_USED evolu_test_compileoption_used
#define DATABASE_VFS evolu_test_database_vfs
#else
#define BUILD_THREADSAFE sqlite3_threadsafe
#define BUILD_OPTION_USED sqlite3_compileoption_used
#define DATABASE_VFS "evolu-codec"
#endif

struct evolu_database {
  sqlite3 *db;
  // Whether the registry holds it, which it does for a file database from
  // before its open to its close, and the registry's neighbors.
  int is_registered;
  evolu_database *previous;
  evolu_database *next;
  // The file's device and inode, which every name of it shares.
  dev_t device;
  ino_t inode;
  // Where the path's last component starts.
  size_t name_at;
  // The path, then room for its longest suffix delete appends.
  char path[];
};

// The file databases the process holds, guarded by SQLITE_MUTEX_STATIC_APP2.
static evolu_database *registry;

static void set_none(evolu_database_error *error) {
  *error = (evolu_database_error){
      EVOLU_DATABASE_ERROR_NONE, SQLITE_OK, NULL, -1, 0,
      {EVOLU_DATABASE_CODEC_FAILURE_NONE, 0}, NULL};
}

/*
 * Sets an error with a message that needs no copy, sqlite3_errstr's for NULL,
 * and returns its code.
 */
static int fail(evolu_database_error *error, evolu_database_error_type type,
                int code, const char *message, int system_errno) {
  set_none(error);
  error->type = type;
  error->code = code;
  error->message = message != NULL ? message : sqlite3_errstr(code);
  error->system_errno = system_errno;
  return code;
}

/*
 * Sets the error of a call that returned code, with the message and offset
 * message_db recorded when it recorded that code, and the codec's failure of
 * database_db's main database. Returns whether the error has an errno, which
 * the caller then sets.
 */
static int set_error_from(evolu_database_error *error, sqlite3 *message_db,
                          sqlite3 *database_db, int code) {
  set_none(error);
  error->type = EVOLU_DATABASE_ERROR_SQLITE;
  error->code = code;
  error->message = sqlite3_errstr(code);
  if (sqlite3_extended_errcode(message_db) == code) {
    char *message = sqlite3_mprintf("%s", sqlite3_errmsg(message_db));
    if (message != NULL) error->message = error->owned_message = message;
    // Only a parser's error sets the offset, which a later error keeps.
    if ((code & 0xff) == SQLITE_ERROR)
      error->sql_offset = sqlite3_error_offset(message_db);
  }
  evolu_codec_failure failure = {EVOLU_CODEC_FAILURE_NONE, 0};
  evolu_codec_take_failure(database_db, &failure);
  error->codec_failure.type = (evolu_database_codec_failure_type)failure.type;
  error->codec_failure.page_number = failure.page_number;
  // SQLite records an errno only for these codes and never clears it, and
  // with a codec failure, it's whatever the thread's errno was.
  int primary = code & 0xff;
  return failure.type == EVOLU_CODEC_FAILURE_NONE &&
         (primary == SQLITE_CANTOPEN || primary == SQLITE_IOERR) &&
         code != SQLITE_IOERR_NOMEM;
}

void evolu_database_set_error(evolu_database_error *error, sqlite3 *db,
                              int code) {
  if (set_error_from(error, db, db, code))
    error->system_errno = sqlite3_system_errno(db);
}

void evolu_database_clear_error(evolu_database_error *error) {
  sqlite3_free(error->owned_message);
  set_none(error);
}

void evolu_database_discard_failure(sqlite3 *db) {
  evolu_codec_failure failure;
  evolu_codec_take_failure(db, &failure);
}

int evolu_database_check_build(evolu_database_error *error) {
  set_none(error);
  if (BUILD_THREADSAFE() != 2 || !BUILD_OPTION_USED("TEMP_STORE=3") ||
      !BUILD_OPTION_USED("ENABLE_LOCKING_STYLE=0"))
    return fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_MISUSE,
                "SQLite was compiled without the options of sqlite_config.h.",
                0);
  int rc = evolu_codec_register(DATABASE_VFS, NULL);
  if (rc != SQLITE_OK) fail(error, EVOLU_DATABASE_ERROR_SQLITE, rc, NULL, 0);
  return rc;
}

static sqlite3_mutex *registry_mutex(void) {
  return sqlite3_mutex_alloc(SQLITE_MUTEX_STATIC_APP2);
}

/* The registered database of the file status describes, or NULL. */
static evolu_database *find(const struct stat *status) {
  for (evolu_database *entry = registry; entry != NULL; entry = entry->next)
    if ((entry->device == status->st_dev) & (entry->inode == status->st_ino))
      return entry;
  return NULL;
}

/* Under the mutex. */
static void add(evolu_database *database, const struct stat *status) {
  database->is_registered = 1;
  database->device = status->st_dev;
  database->inode = status->st_ino;
  database->previous = NULL;
  database->next = registry;
  if (registry != NULL) registry->previous = database;
  registry = database;
}

/* Removes a database from the registry when it's there, and frees it. */
static void release(evolu_database *database) {
  if (database->is_registered) {
    sqlite3_mutex *mutex = registry_mutex();
    sqlite3_mutex_enter(mutex);
    if (database->previous != NULL)
      database->previous->next = database->next;
    else
      registry = database->next;
    if (database->next != NULL)
      database->next->previous = database->previous;
    sqlite3_mutex_leave(mutex);
  }
  sqlite3_free(database);
}

/*
 * Allocates a database without a connection whose path has path_size bytes,
 * or returns NULL.
 */
static evolu_database *allocate(size_t path_size) {
  size_t size = sizeof(evolu_database) + path_size + sizeof "-journal";
  evolu_database *database = sqlite3_malloc64(size);
  if (database != NULL) memset(database, 0, size);
  return database;
}

/*
 * Checks path and allocates a database without a connection that holds it into
 * *resolved.
 */
static int resolve(const char *path, size_t path_size,
                   evolu_database **resolved, evolu_database_error *error) {
  *resolved = NULL;
  const char *invalid = NULL;
  size_t name_at = path_size;
  if (memchr(path, '\0', path_size) != NULL) {
    invalid = "The path contains a NUL character.";
  } else if (path_size == 0 || path[0] != '/') {
    invalid = "The path isn't absolute.";
  } else {
    while (path[name_at - 1] != '/') name_at--;
    size_t name_size = path_size - name_at;
    if (name_size == 0 || (name_size == 1 && path[name_at] == '.') ||
        (name_size == 2 && memcmp(path + name_at, "..", 2) == 0))
      invalid = "The path doesn't end in a file name.";
  }
  if (invalid != NULL)
    return fail(error, EVOLU_DATABASE_ERROR_INVALID_PATH, SQLITE_MISUSE,
                invalid, 0);
  evolu_database *database = allocate(path_size);
  if (database == NULL)
    return fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_NOMEM, NULL, 0);
  memcpy(database->path, path, path_size);
  database->name_at = name_at;
  *resolved = database;
  return SQLITE_OK;
}

/*
 * Opens filename with evolu_codec_open into a database, which is freed and
 * released when the open fails.
 */
static int open_database(evolu_database *database, const char *filename,
                         const uint8_t *key, int flags,
                         evolu_database **opened,
                         evolu_database_error *error) {
  int rc = evolu_codec_open(filename, &database->db, DATABASE_VFS, key, flags);
  if (rc == SQLITE_OK) {
    *opened = database;
    return SQLITE_OK;
  }
  // Without memory for a connection, SQLite returns none, and neither does
  // evolu_codec_open for a VFS that isn't a codec VFS. The codec's failure is
  // taken before the connection closes.
  if (database->db != NULL)
    evolu_database_set_error(error, database->db, rc);
  else
    fail(error, EVOLU_DATABASE_ERROR_SQLITE, rc, NULL, 0);
  sqlite3_close(database->db);
  release(database);
  return rc;
}

int evolu_database_open_memory(evolu_database **database,
                               evolu_database_error *error) {
  set_none(error);
  *database = NULL;
  evolu_database *opening = allocate(0);
  if (opening == NULL)
    return fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_NOMEM, NULL, 0);
  return open_database(opening, ":memory:", NULL, 0, database, error);
}

static int open_file(const char *path, size_t path_size, const uint8_t *key,
                     evolu_database **database, evolu_database_error *error) {
  set_none(error);
  *database = NULL;
  evolu_database *opening;
  int rc = resolve(path, path_size, &opening, error);
  if (rc != SQLITE_OK) return rc;
  // The directory's last level, which a fresh install lacks, up to its
  // trailing slash, which makes it the root for a file in the root.
  char *name = opening->path + opening->name_at;
  char first = *name;
  *name = '\0';
  int is_directory = mkdir(opening->path, 0700) == 0 || errno == EEXIST;
  int directory_errno = errno;
  *name = first;
  if (!is_directory) {
    release(opening);
    return fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CANTOPEN, NULL,
                directory_errno);
  }
  // The file's identity is checked and added under one mutex, before SQLite
  // reads the file, so a second connection never rolls back or reads it. A
  // missing file is created, empty, as SQLite creates a new database's, with
  // its SQLITE_DEFAULT_FILE_PERMISSIONS less the umask, so it has an
  // identity, and SQLite opens it as a new database. O_EXCL follows no
  // symbolic link. Closing the file drops no lock, since no other descriptor
  // in the process can be open on a file just created. lstat sees a symbolic
  // link, not its file, so a link is refused.
  sqlite3_mutex *mutex = registry_mutex();
  sqlite3_mutex_enter(mutex);
  struct stat status;
  int found = lstat(opening->path, &status);
  if (found != 0 && errno == ENOENT) {
    int file =
        open(opening->path, O_RDWR | O_CREAT | O_EXCL | O_CLOEXEC, 0644);
    if (file >= 0) {
      found = fstat(file, &status);
      close(file);
    }
  }
  int refused_errno = 0;
  int is_held = 0;
  if (found != 0)
    refused_errno = errno;
  else if (S_ISLNK(status.st_mode))
    refused_errno = ELOOP;
  else if (find(&status) != NULL)
    is_held = 1;
  else
    add(opening, &status);
  sqlite3_mutex_leave(mutex);
  if (refused_errno != 0 || is_held) {
    release(opening);
    return is_held
               ? fail(error, EVOLU_DATABASE_ERROR_FILE_HELD, SQLITE_BUSY,
                      "Another connection of this process has the database "
                      "open.",
                      0)
               : fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CANTOPEN,
                      NULL, refused_errno);
  }
  // Every file allows SQLCipher's, which no open can tell from new ones.
  return open_database(opening, opening->path, key,
                       EVOLU_CODEC_SQLCIPHER_FILES, database, error);
}

int evolu_database_open_file(const char *path, size_t path_size,
                             evolu_database **database,
                             evolu_database_error *error) {
  return open_file(path, path_size, NULL, database, error);
}

int evolu_database_open_encrypted_file(
    const char *path, size_t path_size,
    const uint8_t key[EVOLU_DATABASE_KEY_SIZE], evolu_database **database,
    evolu_database_error *error) {
  // The codec would open the file in plaintext without one.
  if (key == NULL) {
    *database = NULL;
    return fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_MISUSE, NULL, 0);
  }
  return open_file(path, path_size, key, database, error);
}

sqlite3 *evolu_database_connection(const evolu_database *database) {
  return database->db;
}

int evolu_database_close(evolu_database *database) {
  sqlite3_stmt *statement;
  while ((statement = sqlite3_next_stmt(database->db, NULL)) != NULL)
    sqlite3_finalize(statement);
  // Only a closed connection releases its file's entry.
  int rc = sqlite3_close(database->db);
  if (rc != SQLITE_OK) return rc;
  release(database);
  return SQLITE_OK;
}

int evolu_database_is_file_open(const char *path, size_t path_size,
                                int *is_open, evolu_database_error *error) {
  set_none(error);
  *is_open = 0;
  evolu_database *resolved;
  int rc = resolve(path, path_size, &resolved, error);
  if (rc != SQLITE_OK) return rc;
  sqlite3_mutex *mutex = registry_mutex();
  sqlite3_mutex_enter(mutex);
  struct stat status;
  int found = lstat(resolved->path, &status);
  int lstat_errno = errno;
  if (found == 0) *is_open = find(&status) != NULL;
  sqlite3_mutex_leave(mutex);
  release(resolved);
  // A file in a directory that doesn't exist, or under a path that isn't a
  // directory, doesn't exist, so nothing holds it.
  if (found != 0 && lstat_errno != ENOENT && lstat_errno != ENOTDIR)
    return fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CANTOPEN, NULL,
                lstat_errno);
  return SQLITE_OK;
}

int evolu_database_delete_file(const char *path, size_t path_size,
                               evolu_database_error *error) {
  set_none(error);
  evolu_database *deleting;
  int rc = resolve(path, path_size, &deleting, error);
  if (rc != SQLITE_OK) return rc;
  // All under the mutex, so no open, through any name, creates the file
  // between two removals.
  sqlite3_mutex *mutex = registry_mutex();
  sqlite3_mutex_enter(mutex);
  struct stat status;
  int found = lstat(deleting->path, &status);
  int lstat_errno = errno;
  if (found == 0 && find(&status) != NULL) {
    rc = fail(error, EVOLU_DATABASE_ERROR_FILE_HELD, SQLITE_BUSY,
              "Another connection of this process has the database open.", 0);
  } else if (found != 0 && lstat_errno != ENOENT && lstat_errno != ENOTDIR) {
    rc = fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_CANTOPEN, NULL,
              lstat_errno);
  } else {
    // The database first, as expo-sqlite deletes them, and nothing after a
    // file that stays, so no journal goes while its database stays.
    static const char *const suffixes[] = {"", "-journal", "-wal", "-shm"};
    char *suffix = deleting->path + strlen(deleting->path);
    for (size_t i = 0;
         rc == SQLITE_OK && i < sizeof suffixes / sizeof suffixes[0]; i++) {
      strcpy(suffix, suffixes[i]);
      // A file under a path that isn't a directory doesn't exist.
      if (unlink(deleting->path) != 0 && errno != ENOENT && errno != ENOTDIR)
        rc = fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_IOERR_DELETE,
                  NULL, errno);
    }
  }
  sqlite3_mutex_leave(mutex);
  release(deleting);
  return rc;
}

/* Reads the integer a pragma returns into *value. */
static int read_pragma(sqlite3 *db, const char *sql, sqlite3_int64 *value) {
  sqlite3_stmt *statement = NULL;
  int rc = sqlite3_prepare_v2(db, sql, -1, &statement, NULL);
  if (rc == SQLITE_OK) {
    rc = sqlite3_step(statement);
    // Reading a column without a row would record SQLITE_RANGE over the
    // step's error.
    if (rc == SQLITE_ROW) {
      *value = sqlite3_column_int64(statement, 0);
      rc = SQLITE_OK;
    }
  }
  // It keeps the step's error on the connection.
  sqlite3_finalize(statement);
  return rc;
}

int evolu_database_export(evolu_database *database, uint8_t **bytes,
                          size_t *size, evolu_database_error *error) {
  set_none(error);
  *bytes = NULL;
  *size = 0;
  sqlite3 *db = database->db;
  evolu_database_discard_failure(db);
  // sqlite3_backup_step refuses a database being written, and
  // sqlite3_serialize would copy its uncommitted pages.
  if (sqlite3_txn_state(db, "main") == SQLITE_TXN_WRITE)
    return fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_BUSY, NULL, 0);
  // What sqlite3_serialize reads, the page size through a function the
  // binding can't call.
  sqlite3_int64 page_count = 0;
  sqlite3_int64 page_size = 0;
  int rc = read_pragma(db, "PRAGMA main.page_count", &page_count);
  if (rc == SQLITE_OK)
    rc = read_pragma(db, "PRAGMA main.page_size", &page_size);
  if (rc != SQLITE_OK) {
    evolu_database_set_error(error, db, rc);
    return rc;
  }
  // An empty database's copy gets a page 1, and sqlite3_malloc64(0) returns
  // NULL.
  sqlite3_uint64 allocation =
      (sqlite3_uint64)(page_count > 0 ? page_count : 1) *
      (sqlite3_uint64)page_size;
  uint8_t *buffer = sqlite3_malloc64(allocation);
  if (buffer == NULL)
    return fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_NOMEM, NULL, 0);

  // A plain database in memory, not through the codec, whose file is the
  // buffer: without SQLITE_DESERIALIZE_RESIZEABLE, SQLite never reallocates
  // it and fails a write past it with SQLITE_FULL; without
  // SQLITE_DESERIALIZE_FREEONCLOSE, it stays the export's; and with a size of
  // 0, the copy starts empty, so the backup gives it the database's page size
  // and journals nothing.
  sqlite3 *copy = NULL;
  rc = sqlite3_open_v2(":memory:", &copy,
                       SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE |
                           SQLITE_OPEN_EXRESCODE | SQLITE_OPEN_NOMUTEX,
                       NULL);
  if (rc == SQLITE_OK)
    rc = sqlite3_deserialize(copy, "main", buffer, 0,
                             (sqlite3_int64)allocation, 0);
  if (rc != SQLITE_OK) {
    fail(error, EVOLU_DATABASE_ERROR_SQLITE, rc, NULL, 0);
  } else {
    sqlite3_backup *backup = sqlite3_backup_init(copy, "main", db, "main");
    if (backup == NULL) {
      rc = sqlite3_extended_errcode(copy);
    } else {
      sqlite3_backup_step(backup, -1);
      rc = sqlite3_backup_finish(backup);
    }
    if (rc != SQLITE_OK) {
      // The copy records the backup's error, and the database's file the
      // errno of the read that failed, which the copy's would have lost by
      // now.
      if (set_error_from(error, copy, db, rc)) {
        int file_errno = 0;
        sqlite3_file_control(db, "main", SQLITE_FCNTL_LAST_ERRNO, &file_errno);
        error->system_errno = file_errno;
      }
    } else {
      // A database that shrank since its page count was read would leave the
      // buffer's end unwritten.
      sqlite3_int64 copied = 0;
      sqlite3_serialize(copy, "main", &copied, SQLITE_SERIALIZE_NOCOPY);
      if ((sqlite3_uint64)copied != allocation)
        rc = fail(error, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_BUSY,
                  "The database changed while it was exported.", 0);
    }
  }
  sqlite3_close(copy);
  if (rc != SQLITE_OK) {
    // The copy's cache may have spilled pages into it, which its rollback
    // left there.
    evolu_wipe(buffer, (size_t)allocation);
    sqlite3_free(buffer);
    return rc;
  }
  *bytes = buffer;
  *size = (size_t)allocation;
  return SQLITE_OK;
}

void evolu_database_free_export(uint8_t *bytes, size_t size) {
  evolu_wipe(bytes, size);
  sqlite3_free(bytes);
}

int evolu_database_random_bytes(uint8_t *output, size_t size) {
  return evolu_random_bytes(output, size) == EVOLU_CRYPTO_OK ? SQLITE_OK
                                                             : SQLITE_ERROR;
}
