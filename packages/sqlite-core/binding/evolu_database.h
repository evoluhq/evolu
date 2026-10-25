/*
 * What every native binding of Evolu's SQLite core shares, so React Native's
 * JSI adapter and the Node-API one behave alike: the build check, how a
 * database opens, the registry that keeps one connection per database file in
 * the process, deleting and exporting a database, and the error record an
 * adapter turns into its JavaScript error. Only native builds compile it: it
 * calls POSIX file functions, and the wasm has no use for it. The adapters
 * prepare and step statements on the connection themselves, because they
 * produce their engine's own values.
 *
 * This header includes only SQLite's, through evolu_sqlite3.h, and standard
 * headers, so an adapter that finds no other header of the core can include
 * it. It declares itself what the adapters need of the codec, the failure the
 * codec records, which evolu_database.c checks against evolu_codec.h.
 *
 * ## Opening
 *
 * - An adapter calls evolu_database_check_build first. It checks that SQLite
 *   runs in multi-thread mode, with sqlite_config.h's temporary files in memory
 *   and POSIX locking, which a build system that dropped SQLITE_CUSTOM_INCLUDE
 *   would lose, and registers the codec VFS "evolu-codec" over the default VFS
 *   unless it is registered already.
 * - A memory database and an encrypted file with a 32-byte key, which the
 *   codec copies, open with evolu_codec_open on that VFS, which opens them
 *   read-write, created when missing, without SQLite's connection mutex.
 *   Every encrypted file opens with EVOLU_CODEC_SQLCIPHER_FILES, because no
 *   open can tell the files that expo-sqlite's SQLCipher wrote from new ones,
 *   and a journal of either needs it to roll back.
 * - A plain file opens with plain SQLite on the default VFS, with the same
 *   flags, set up by evolu_core_register, and reads its schema, as
 *   evolu_codec_open does, so WAL, memory-mapped I/O and direct overflow reads
 *   work as SQLite has them. Its authorizer refuses the pragmas that key a
 *   database, which plain SQLite would ignore, with SQLITE_AUTH, as the codec
 *   refuses them, and attached databases open read-only, as on the codec's
 *   connections, because SQLite ignores ATTACH's KEY clause. Evolu opens every
 *   file of its own with a key, so a plain file is one that holds no secret,
 *   such as the relay's. An encrypted file opened without its key fails with
 *   SQLITE_NOTADB, and plain SQLite would roll back its hot journal as
 *   plaintext, which Evolu doesn't support.
 * - No pragma is set, so files keep DELETE journals and SQLite's 4096-byte
 *   pages, as expo-sqlite kept them.
 * - A wrong key, or a plaintext file opened with a key, fails with a page's
 *   authentication failure: page 1's, with SQLITE_NOTADB, or with a hot
 *   journal, that of its first record's page, with SQLITE_NOTADB for page 1
 *   and SQLITE_CORRUPT for another, and the journal stays for the right key.
 *   Nothing deletes or recreates a database after a failed open.
 *
 * ## Paths and the registry
 *
 * - A path comes with its byte length, as JavaScript strings do. One that
 *   contains a NUL character, which a C string would cut short, that isn't
 *   absolute, or whose last component is empty, . or .., fails with
 *   EVOLU_DATABASE_ERROR_INVALID_PATH before any file is touched.
 * - The registry knows a file by its device and inode, which lstat reads, so
 *   every name of it is one file: through an alias of its directory, such as
 *   /var and /private/var, a hard link, or another case on a volume that
 *   ignores case, as Apple's do by default. An open first creates the
 *   directory's last level with mode 0700 when it is missing, and a missing
 *   file, empty, with the mode SQLite gives a new database's, so it has an
 *   inode; SQLite opens an empty file as a new database, and a failed open
 *   leaves it. A database path that is a symbolic link fails the open with
 *   SQLITE_CANTOPEN and ELOOP, since lstat reads the link's own inode.
 * - An open that finds its file held by another connection of the process
 *   fails with EVOLU_DATABASE_ERROR_FILE_HELD before SQLite touches the file,
 *   so it neither reads it nor rolls back its journal. Check and insert happen
 *   under one mutex, before the open, which runs without it. An entry is
 *   removed only by what added it, the open that then failed or the close of
 *   its connection, never by a lookup of its file, so a late close never
 *   releases a newer connection's file.
 * - A file in a directory that doesn't exist, or under a path that isn't a
 *   directory, doesn't exist, so for a path that lstat fails with ENOENT or
 *   ENOTDIR, evolu_database_is_file_open returns false and
 *   evolu_database_delete_file finds nothing to remove.
 * - evolu_database_delete_file refuses a held file. Otherwise it removes the
 *   database first and then its -journal, -wal and -shm, as expo-sqlite does,
 *   holding the registry's mutex, so no open, through any name, creates the
 *   file between two removals. It stops at the first that it can't remove,
 *   with SQLITE_IOERR_DELETE and unlink's errno, so a journal is never removed
 *   while its database stays. Missing files are fine.
 *
 * ## Export
 *
 * evolu_database_export copies a database into one buffer, the plaintext file
 * of the same pages, with sqlite3_backup into a plain in-memory database whose
 * file image is that buffer. sqlite3_serialize would zero-fill a page that
 * fails to read and report success, and nothing records the unix VFS's read
 * errors natively, so the backup fails the export instead.
 *
 * - A connection in a write transaction fails with SQLITE_BUSY before
 *   anything is allocated, since sqlite3_backup_step refuses it.
 * - The buffer holds the page count times the page size, which pragmas read,
 *   and at least one page, since an empty database's copy gets page 1. The
 *   copy's file never grows or frees it: a database that grew meanwhile fails
 *   with SQLITE_FULL, and one that shrank, which would leave the buffer's end
 *   unwritten, with SQLITE_BUSY.
 * - The export is every byte sqlite3_serialize returns for an intact database
 *   with a page 1, but for page 1's change counter, schema cookie,
 *   version-valid-for number and SQLite version number, bytes 24 to 27, 40 to
 *   43 and 92 to 99, which the copy's commit writes. An empty database
 *   exports as one empty page and its file stays empty.
 * - A failed export wipes the whole buffer before it frees it, since the
 *   copy's cache may have spilled pages into it, and
 *   evolu_database_free_export wipes an export before it frees it.
 *
 * ## Statements
 *
 * evolu_database_prepare prepares exactly one statement, as
 * @evolu/sqlite-wasm's prepare does, so nothing after it is silently ignored:
 *
 * - SQL with a NUL character, which SQLite reads SQL only up to, fails with
 *   EVOLU_DATABASE_ERROR_INVALID_SQL_TEXT before SQLite sees it. An adapter
 *   refuses a lone surrogate itself, since UTF-8 can't encode one.
 * - SQL without a statement, only whitespace or comments, fails with
 *   EVOLU_DATABASE_ERROR_EMPTY_SQL.
 * - Only semicolons, whitespace, UTF-8 byte order marks and comments may
 *   follow the statement, or the prepare fails with
 *   EVOLU_DATABASE_ERROR_MULTIPLE_STATEMENTS. The rest is scanned as SQLite
 *   3.54.1's tokenizer reads it, not prepared, since SQLite applies some
 *   pragmas, such as foreign_keys, when it prepares them.
 *
 * ## Errors
 *
 * Every function that takes an error record sets it, to
 * EVOLU_DATABASE_ERROR_NONE when it succeeds, and returns SQLITE_OK or the
 * record's code. It overwrites the record without freeing its message, so a
 * record that holds an error is cleared with evolu_database_clear_error before
 * it's passed to another function. A record from SQLite has its extended code,
 * a copy of sqlite3_errmsg when the connection recorded that code and
 * sqlite3_errstr's message otherwise, and for a parser error, SQLITE_ERROR,
 * the offset in the SQL where it was found, or -1.
 *
 * - Its codec failure is the one the codec recorded for the call. The codec
 *   keeps a failure until it's taken, so every call into SQLite first discards
 *   what an earlier call left with evolu_database_discard_failure, as the
 *   export does.
 * - Its system errno is 0 unless the primary code is SQLITE_CANTOPEN or
 *   SQLITE_IOERR, but not SQLITE_IOERR_NOMEM, and the codec recorded no
 *   failure, because only then is it the error's: SQLite records it for those
 *   codes and never clears it, and with a codec failure it is whatever the
 *   thread's errno was. An export's failed backup takes it from the database's
 *   file, which keeps its last read's. It's diagnostic only: for a
 *   SQLITE_CANTOPEN or SQLITE_IOERR that SQLite raises without a failed system
 *   call, such as for a WAL file next to a rollback database, it's whatever
 *   errno SQLite's own file checks left.
 * - A message the record can't copy is sqlite3_errstr's.
 *
 * ## Threads
 *
 * A connection is used from one thread at a time. The registry is the one
 * mutable state, guarded by SQLITE_MUTEX_STATIC_APP2, since the codec holds
 * SQLITE_MUTEX_STATIC_APP1 while it registers and static mutexes aren't
 * recursive.
 */
#ifndef EVOLU_DATABASE_H
#define EVOLU_DATABASE_H

/* Every binding unit includes this header, so it holds sqlite_config.h's
 * guard. */
#if defined(EVOLU_NATIVE_PACKAGE) && !defined(EVOLU_NAMES_H)
#error "Compile Evolu's native C through its units, which include evolu_names.h first."
#endif

#include <stddef.h>
#include <stdint.h>

#include "evolu_sqlite3.h"

#ifdef __cplusplus
extern "C" {
#endif

#define EVOLU_DATABASE_KEY_SIZE 32

/* The codec's failure types, with evolu_codec.h's values. */
typedef enum {
  EVOLU_DATABASE_CODEC_FAILURE_NONE = 0,
  /* A page, page_number, failed to authenticate. */
  EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION = 1,
  /* SQLite asked for something the codec can't keep encrypted. */
  EVOLU_DATABASE_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED = 2,
  /* The platform's random source failed during a write. */
  EVOLU_DATABASE_CODEC_FAILURE_RANDOM = 3,
} evolu_database_codec_failure_type;

/* The failure the codec recorded, laid out as evolu_codec_failure. */
typedef struct {
  evolu_database_codec_failure_type type;
  /* The page, for EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION. */
  uint32_t page_number;
} evolu_database_codec_failure;

typedef enum {
  EVOLU_DATABASE_ERROR_NONE = 0,
  /* SQLite failed, or the binding with a result code of SQLite's. */
  EVOLU_DATABASE_ERROR_SQLITE = 1,
  /* Another connection of the process has the database file open. */
  EVOLU_DATABASE_ERROR_FILE_HELD = 2,
  /* A path names no file a database can be. */
  EVOLU_DATABASE_ERROR_INVALID_PATH = 3,
  /* The SQL contains no statement, only whitespace or comments. */
  EVOLU_DATABASE_ERROR_EMPTY_SQL = 4,
  /* The SQL contains more than one statement. */
  EVOLU_DATABASE_ERROR_MULTIPLE_STATEMENTS = 5,
  /* The SQL contains a NUL character. */
  EVOLU_DATABASE_ERROR_INVALID_SQL_TEXT = 6,
} evolu_database_error_type;

typedef struct {
  evolu_database_error_type type;
  /*
   * SQLite's extended result code; SQLITE_BUSY for a held file, and
   * SQLITE_MISUSE for an invalid path and SQL that prepare refuses itself.
   */
  int code;
  /* Valid until evolu_database_clear_error. */
  const char *message;
  /*
   * Where in the SQL a parser error (SQLITE_ERROR) was found, as
   * sqlite3_error_offset, or -1.
   */
  int sql_offset;
  /* The errno of the error, or 0. */
  int system_errno;
  evolu_database_codec_failure codec_failure;
  /* The copy message points to, which evolu_database_clear_error frees. */
  char *owned_message;
} evolu_database_error;

/* An open database: its connection and its file's entry in the registry. */
typedef struct evolu_database evolu_database;

/*
 * Checks the build and registers the codec VFS. Returns SQLITE_MISUSE for
 * SQLite compiled without sqlite_config.h's options, or the registration's
 * result.
 */
int evolu_database_check_build(evolu_database_error *error);

/* Opens a database in memory, with *database NULL when it fails. */
int evolu_database_open_memory(evolu_database **database,
                               evolu_database_error *error);

/*
 * Opens the plain database file at the path_size bytes of path with plain
 * SQLite on the default VFS, with *database NULL when it fails.
 */
int evolu_database_open_file(const char *path, size_t path_size,
                             evolu_database **database,
                             evolu_database_error *error);

/*
 * Opens the database file at path, encrypted with key, and refuses a NULL key
 * with SQLITE_MISUSE, which would open it in plaintext.
 */
int evolu_database_open_encrypted_file(
    const char *path, size_t path_size,
    const uint8_t key[EVOLU_DATABASE_KEY_SIZE], evolu_database **database,
    evolu_database_error *error);

/* The connection, for the adapter's statements. */
sqlite3 *evolu_database_connection(const evolu_database *database);

/*
 * Finalizes the statements the skiplist functions keep, then every other
 * statement SQLite holds for the connection, and closes it, which frees the
 * database and releases its file's entry. When SQLite can't close it, as with
 * a backup unfinished, it returns that result, keeping the connection and the
 * entry, so the file stays held, and may be called again.
 */
int evolu_database_close(evolu_database *database);

/* Sets *is_open to whether a connection of the process holds the file. */
int evolu_database_is_file_open(const char *path, size_t path_size,
                                int *is_open, evolu_database_error *error);

/* Deletes the database file at path and the files SQLite keeps next to it. */
int evolu_database_delete_file(const char *path, size_t path_size,
                               evolu_database_error *error);

/*
 * Exports the database as the size bytes of *bytes, which
 * evolu_database_free_export frees; *bytes is NULL when it fails.
 */
int evolu_database_export(evolu_database *database, uint8_t **bytes,
                          size_t *size, evolu_database_error *error);

/* Wipes and frees an export. */
void evolu_database_free_export(uint8_t *bytes, size_t size);

/*
 * Prepares the one statement of the sql_size bytes of sql, which a NUL
 * follows, so SQLite reads them in place, with *statement NULL when it fails.
 */
int evolu_database_prepare(evolu_database *database, const char *sql,
                           size_t sql_size, sqlite3_stmt **statement,
                           evolu_database_error *error);

/*
 * Discards the failure the codec recorded for db's main database, which a call
 * into SQLite does first.
 */
void evolu_database_discard_failure(sqlite3 *db);

/* Sets the error record of a call on db that returned code. */
void evolu_database_set_error(evolu_database_error *error, sqlite3 *db,
                              int code);

/*
 * Frees the record's message and sets it to EVOLU_DATABASE_ERROR_NONE, which
 * leaves a record that is that already as it is.
 */
void evolu_database_clear_error(evolu_database_error *error);

/*
 * Fills output with size bytes of the platform's CSPRNG, as
 * crypto.getRandomValues does. Returns SQLITE_OK, or SQLITE_ERROR when the
 * random source fails, which arc4random_buf never does.
 */
int evolu_database_random_bytes(uint8_t *output, size_t size);

/*
 * Zeroes size bytes at bytes in a way the compiler can't drop, as an adapter
 * wipes its copy of a key after the open.
 */
void evolu_database_wipe(void *bytes, size_t size);

#ifdef EVOLU_TEST_HOOKS
/*
 * What the build check reads, the codec VFS name keyed and memory opens use,
 * and the VFS name plain file opens use, NULL for the default, which a test
 * can replace, as with a VFS that fails its calls.
 */
extern int (*evolu_test_threadsafe)(void);
extern int (*evolu_test_compileoption_used)(const char *name);
extern const char *evolu_test_database_vfs;
extern const char *evolu_test_plain_vfs;
#endif

#ifdef __cplusplus
}
#endif

#endif
