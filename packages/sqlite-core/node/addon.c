/*
 * A minimal Node-API addon over Evolu's SQLite core, used only by tests for
 * now, so Evolu's TypeScript tests can drive the C core.
 * scripts/build-addon.mts builds it and test/addon.mts loads and types it. Each
 * function is a thin layer over its SQLite C function, with exact conversions:
 *
 * - Handles are Node-API externals with a type tag, so a handle of the other
 *   kind or any other value throws a TypeError instead of being read as the
 *   wrong struct. A connection is opened with SQLITE_OPEN_NOMUTEX added to the
 *   caller's flags (SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE by default),
 *   because one thread owns it; SQLite gives it precedence over
 *   SQLITE_OPEN_FULLMUTEX.
 * - Lifetimes: a closed database and a finalized statement throw when used,
 *   and closing or finalizing one again does nothing. Closing a database
 *   finalizes its statements first, so SQLite closes it at once. A connection
 *   lives until neither its handle nor a statement refers to it, so the
 *   garbage collector may collect handles in any order: a collected statement
 *   is finalized, and a collected database handle leaves the connection open
 *   until its last statement is finalized, so a statement stays usable.
 * - Strings convert with napi_get_value_string_utf8, which replaces a lone
 *   surrogate with U+FFFD, as Evolu's wasm layer binds it. Text binds with its
 *   exact byte length, so NUL characters survive. SQL, paths and compile
 *   option names reach SQLite NUL-terminated, so one with a NUL character
 *   throws rather than being cut short, and so does one with a lone
 *   surrogate, which two strings would otherwise share, as Evolu's wasm layer
 *   refuses such SQL.
 * - Binding, at a 1-based index: null binds NULL; a number that is a safe
 *   integer (Number.isSafeInteger) binds with sqlite3_bind_int64, so it stays
 *   INTEGER, and any other number with sqlite3_bind_double, which stores the
 *   same as Evolu's wasm layer; a bigint binds with sqlite3_bind_int64 and
 *   throws a RangeError outside the int64 range; a string binds as text; a
 *   Uint8Array binds its bytes as a BLOB, an empty one as an empty BLOB, not
 *   NULL. A boolean throws a TypeError, like undefined and any other value:
 *   SQLite has no boolean and Evolu's SqliteValue has none, so callers bind 0
 *   or 1.
 * - Reading, at a 0-based index, with sqlite3_column_type first: INTEGER reads
 *   as a number within the safe integer range and as a bigint outside it, so
 *   no integer loses precision (Evolu's wasm layer reads every INTEGER with
 *   sqlite3_column_double instead); REAL as a number; TEXT as a string decoded
 *   from its exact byte length, so NUL characters survive, with invalid UTF-8
 *   replaced by U+FFFD; a BLOB as a copy in a Uint8Array of its own. A column
 *   is read only while the last step returned a row and within the column
 *   count, because SQLite leaves other reads undefined.
 * - prepare prepares exactly one statement: only whitespace and semicolons may
 *   follow it, so a second statement or a trailing comment throws rather than
 *   being ignored, and SQL without a statement throws. exec runs every
 *   statement with sqlite3_exec, which binds NULL to any parameter.
 * - Errors: a failure SQLite reports throws an Error with sqlite3_errmsg as its
 *   message and the primary and extended result codes as `resultCode` and
 *   `extendedCode`. reset and finalize throw SQLite's error only when the last
 *   step returned a row: stopping the statement then completes it, and an
 *   autocommit write commits, which can fail. Otherwise their result only
 *   repeats the error of the step that already threw, and they ignore it.
 *   close finalizes its statements the same way, closes the connection and
 *   then throws the first such error. Misuse throws a plain Error, TypeError
 *   or RangeError without codes.
 * - openCodec opens a database with evolu_codec_open on a codec VFS named
 *   "evolu-codec" over the default VFS, which it registers, keyed with a
 *   32-byte Uint8Array or plaintext with null, and with evolu_codec_open's
 *   flags, 0 by default. Its error also carries the codec's failure, when one
 *   was recorded, as `codecFailure`.
 *   takeCodecFailure returns and clears the failure the codec recorded, as
 *   `{ type, pageNumber }`, or null.
 * - openCodec's test-only crash copy, `{ write, copy }`, opens the database on
 *   another codec VFS, "evolu-codec-crash-copy", over a VFS that copies the
 *   database and its journal, when it has one, to `copy` and `copy-journal`
 *   before the connection's write numbered `write`, counted from 1 at the
 *   open, as a power loss would leave them, as test/sqlcipher/fixture.c's
 *   crash does, and then writes on. A copy that fails fails that write.
 * - createBinding returns the N-API mirror of React Native's binding, which
 *   node/binding.c describes. autoRegisterWriteLog(true) gives every
 *   connection opened after it a SQL function, write_log(), which inserts two
 *   rows into the connection's table log, with an auto extension, so a test
 *   sees what the mirror reports for a read-only statement that writes, and
 *   autoRegisterWriteLog(false) resets the auto extensions.
 *
 * The addon keeps no mutable global state, apart from the crash copy's VFS,
 * registered once under a mutex, and the crash copy an open hands its database
 * file through a thread-local during the call, so every Node.js environment
 * that loads it, such as a worker thread, has its own handles.
 */
#include <node_api.h>

#include "evolu_codec.h"
#include "sqlite3.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct Statement Statement;

// What openCodec's crash copy copies, and before which write.
typedef struct {
  int write;
  int writes;
  // The database's name, which SQLite keeps while the file is open, and its
  // file under the codec, through which the copy reads it, since opening and
  // closing it again would drop the process's POSIX locks on it.
  const char *database;
  sqlite3_file *database_file;
  char *copy;
} CrashCopy;

typedef struct {
  sqlite3 *db; // NULL once closed.
  // Unfinalized statements, which close finalizes.
  Statement *statements;
  // The handle and every unfinalized statement, which keep this struct.
  size_t references;
  // The crash copy its files count writes for, or NULL.
  CrashCopy *crash_copy;
} Database;

struct Statement {
  sqlite3_stmt *stmt; // NULL once finalized.
  Database *database; // NULL once finalized.
  Statement *previous;
  Statement *next;
  // Whether the last step returned a row, which columns can be read from.
  bool has_row;
};

// Random values that mark the externals of this addon by kind.
static const napi_type_tag database_tag = {0x8f3c2a1e5b7d4c60ULL,
                                           0x9e1f0a2b3c4d5e6fULL};
static const napi_type_tag statement_tag = {0x2d4b6f8a1c3e5072ULL,
                                            0x7a9c1e3f5b7d9f01ULL};

// The largest integer a JS number holds exactly, Number.MAX_SAFE_INTEGER.
#define MAX_SAFE_INTEGER 9007199254740991LL

// Drops a reference to a connection, closing and freeing it after the last.
static void release_database(Database *database) {
  if (--database->references > 0) return;
  sqlite3_close_v2(database->db);
  // After the connection's files, which point to it, closed.
  if (database->crash_copy != NULL) {
    sqlite3_free(database->crash_copy->copy);
    free(database->crash_copy);
  }
  free(database);
}

// Finalizes a statement unless it's finalized already, and unlinks it from its
// connection. Returns sqlite3_finalize's result, and with `error`, when that
// fails, creates SQLite's error into it before the connection may close.
static int finalize_statement_with(Statement *statement, napi_env env,
                                   napi_value *error);

static void finalize_statement(Statement *statement) {
  finalize_statement_with(statement, NULL, NULL);
}

static bool create_code_error(napi_env env, const char *message, int extended,
                              napi_value *error);

static int finalize_statement_with(Statement *statement, napi_env env,
                                   napi_value *error) {
  if (statement->stmt == NULL) return SQLITE_OK;
  int rc = sqlite3_finalize(statement->stmt);
  Database *database = statement->database;
  if (statement->previous != NULL)
    statement->previous->next = statement->next;
  else
    database->statements = statement->next;
  if (statement->next != NULL) statement->next->previous = statement->previous;
  *statement = (Statement){0};
  // After unlinking, since setting the error's codes can run JS, which may use
  // the statement or close the connection. The message is copied before.
  if (rc != SQLITE_OK && error != NULL &&
      !create_code_error(env, sqlite3_errmsg(database->db),
                         sqlite3_extended_errcode(database->db), error))
    *error = NULL;
  release_database(database);
  return rc;
}

static void collect_database(napi_env env, void *data, void *hint) {
  (void)env;
  (void)hint;
  release_database(data);
}

static void collect_statement(napi_env env, void *data, void *hint) {
  (void)env;
  (void)hint;
  finalize_statement(data);
  free(data);
}

// Returns NULL, throwing an Error for the Node-API call that just failed
// unless it left an exception pending.
static napi_value fail(napi_env env) {
  const napi_extended_error_info *info = NULL;
  const char *message = "Node-API call failed";
  // Read before any other call, which would replace it.
  if (napi_get_last_error_info(env, &info) == napi_ok && info != NULL &&
      info->error_message != NULL)
    message = info->error_message;
  bool pending = false;
  if (napi_is_exception_pending(env, &pending) == napi_ok && !pending)
    napi_throw_error(env, NULL, message);
  return NULL;
}

// Like fail, for functions that return a result code: returns -1.
static int fail_code(napi_env env) {
  fail(env);
  return -1;
}

// Creates an Error with `message` and the result codes of an extended result
// code, or returns false with a Node-API error.
static bool create_code_error(napi_env env, const char *message, int extended,
                              napi_value *error) {
  napi_value text, result_code, extended_code;
  return napi_create_string_utf8(env, message, NAPI_AUTO_LENGTH, &text) ==
             napi_ok &&
         napi_create_error(env, NULL, text, error) == napi_ok &&
         napi_create_int32(env, extended & 0xff, &result_code) == napi_ok &&
         napi_create_int32(env, extended, &extended_code) == napi_ok &&
         napi_set_named_property(env, *error, "resultCode", result_code) ==
             napi_ok &&
         napi_set_named_property(env, *error, "extendedCode",
                                 extended_code) == napi_ok;
}

// Throws an Error with `message` and the result codes of an extended result
// code, and returns NULL.
static napi_value throw_code(napi_env env, const char *message, int extended) {
  napi_value error;
  if (!create_code_error(env, message, extended, &error) ||
      napi_throw(env, error) != napi_ok)
    return fail(env);
  return NULL;
}

// Throws the error SQLite recorded for a connection, and returns NULL.
static napi_value throw_sqlite_error(napi_env env, sqlite3 *db) {
  return throw_code(env, sqlite3_errmsg(db), sqlite3_extended_errcode(db));
}

static napi_value throw_nomem(napi_env env) {
  return throw_code(env, sqlite3_errstr(SQLITE_NOMEM), SQLITE_NOMEM);
}

// Reads `count` arguments into argv, missing ones as undefined.
static bool get_args(napi_env env, napi_callback_info info, size_t count,
                     napi_value *argv) {
  size_t argc = count;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) == napi_ok)
    return true;
  fail(env);
  return false;
}

// Returns the data of an external with `tag`, or NULL with a TypeError naming
// what was expected.
static void *get_handle(napi_env env, napi_value value,
                        const napi_type_tag *tag, const char *expected) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok) return fail(env);
  bool tagged = false;
  if (type == napi_external &&
      napi_check_object_type_tag(env, value, tag, &tagged) != napi_ok)
    return fail(env);
  if (!tagged) {
    napi_throw_type_error(env, NULL, expected);
    return NULL;
  }
  void *data;
  if (napi_get_value_external(env, value, &data) != napi_ok) return fail(env);
  return data;
}

static Database *get_database(napi_env env, napi_value value) {
  return get_handle(env, value, &database_tag, "expected a database");
}

static Statement *get_statement(napi_env env, napi_value value) {
  return get_handle(env, value, &statement_tag, "expected a statement");
}

// Returns an open connection, or NULL with an exception pending.
static Database *get_open_database(napi_env env, napi_value value) {
  Database *database = get_database(env, value);
  if (database == NULL || database->db != NULL) return database;
  napi_throw_error(env, NULL, "database is closed");
  return NULL;
}

// Returns an unfinalized statement, or NULL with an exception pending.
static Statement *get_live_statement(napi_env env, napi_value value) {
  Statement *statement = get_statement(env, value);
  if (statement == NULL || statement->stmt != NULL) return statement;
  napi_throw_error(env, NULL, "statement is finalized");
  return NULL;
}

// Wraps data in an external with `tag`, collected by `collect`, which also
// runs when wrapping fails. Returns NULL with an exception pending then.
static napi_value create_handle(napi_env env, void *data,
                                const napi_type_tag *tag,
                                napi_finalize collect) {
  napi_value handle;
  if (napi_create_external(env, data, collect, NULL, &handle) != napi_ok) {
    collect(env, data, NULL);
    return fail(env);
  }
  // From here, the garbage collector runs `collect`.
  if (napi_type_tag_object(env, handle, tag) != napi_ok) return fail(env);
  return handle;
}

// Reads a 32-bit integer, or returns false with an exception pending.
static bool get_int(napi_env env, napi_value value, int *result) {
  napi_valuetype type;
  double number;
  if (napi_typeof(env, value, &type) != napi_ok) {
    fail(env);
    return false;
  }
  if (type != napi_number) {
    napi_throw_type_error(env, NULL, "expected an integer");
    return false;
  }
  if (napi_get_value_double(env, value, &number) != napi_ok) {
    fail(env);
    return false;
  }
  // The range check comes first, so the cast is defined, and it fails for NaN.
  if (!(number >= -2147483648.0 && number <= 2147483647.0) ||
      (double)(int)number != number) {
    napi_throw_range_error(
        env, NULL, "expected an integer from -2147483648 to 2147483647");
    return false;
  }
  *result = (int)number;
  return true;
}

// Returns a JS string as NUL-terminated UTF-8 from sqlite3_malloc64, its byte
// length in *length, or NULL with an exception pending. A lone surrogate
// becomes U+FFFD.
static char *get_utf8(napi_env env, napi_value value, size_t *length) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok) {
    fail(env);
    return NULL;
  }
  if (type != napi_string) {
    napi_throw_type_error(env, NULL, "expected a string");
    return NULL;
  }
  if (napi_get_value_string_utf8(env, value, NULL, 0, length) != napi_ok) {
    fail(env);
    return NULL;
  }
  char *text = sqlite3_malloc64(*length + 1);
  if (text == NULL) {
    throw_nomem(env);
    return NULL;
  }
  if (napi_get_value_string_utf8(env, value, text, *length + 1, length) !=
      napi_ok) {
    fail(env);
    sqlite3_free(text);
    return NULL;
  }
  return text;
}

// Whether a JS string has a lone surrogate, or -1 with an exception pending.
static int has_lone_surrogate(napi_env env, napi_value value) {
  size_t length;
  if (napi_get_value_string_utf16(env, value, NULL, 0, &length) != napi_ok)
    return fail_code(env);
  char16_t *units = malloc((length + 1) * sizeof *units);
  if (units == NULL) {
    throw_nomem(env);
    return -1;
  }
  if (napi_get_value_string_utf16(env, value, units, length + 1, &length) !=
      napi_ok) {
    free(units);
    return fail_code(env);
  }
  int lone = 0;
  for (size_t i = 0; i < length && !lone; i++) {
    bool is_high = units[i] >= 0xd800 && units[i] <= 0xdbff;
    bool is_low = units[i] >= 0xdc00 && units[i] <= 0xdfff;
    if (is_high && i + 1 < length && units[i + 1] >= 0xdc00 &&
        units[i + 1] <= 0xdfff)
      i++;
    else if (is_high || is_low)
      lone = 1;
  }
  free(units);
  return lone;
}

// Returns a well-formed JS string without NUL characters as get_utf8 does, for
// SQLite functions that take NUL-terminated strings.
static char *get_c_string(napi_env env, napi_value value, size_t *length) {
  char *text = get_utf8(env, value, length);
  if (text == NULL) return NULL;
  int lone = memchr(text, 0, *length) == NULL ? has_lone_surrogate(env, value)
                                              : 1;
  if (lone == 0) return text;
  sqlite3_free(text);
  if (lone > 0)
    napi_throw_type_error(
        env, NULL, "expected a well-formed string without NUL characters");
  return NULL;
}

static napi_value undefined(napi_env env) {
  napi_value result;
  if (napi_get_undefined(env, &result) != napi_ok) return fail(env);
  return result;
}

static napi_value js_libversion(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value result;
  if (napi_create_string_utf8(env, sqlite3_libversion(), NAPI_AUTO_LENGTH,
                              &result) != napi_ok)
    return fail(env);
  return result;
}

static napi_value js_sourceid(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value result;
  if (napi_create_string_utf8(env, sqlite3_sourceid(), NAPI_AUTO_LENGTH,
                              &result) != napi_ok)
    return fail(env);
  return result;
}

static napi_value js_compile_option_used(napi_env env,
                                         napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv)) return NULL;
  size_t length;
  char *name = get_c_string(env, argv[0], &length);
  if (name == NULL) return NULL;
  int used = sqlite3_compileoption_used(name);
  sqlite3_free(name);
  napi_value result;
  if (napi_get_boolean(env, used, &result) != napi_ok) return fail(env);
  return result;
}

static napi_value js_open(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  if (!get_args(env, info, 2, argv)) return NULL;
  napi_valuetype flags_type;
  if (napi_typeof(env, argv[1], &flags_type) != napi_ok) return fail(env);
  int flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE;
  if (flags_type != napi_undefined && !get_int(env, argv[1], &flags))
    return NULL;
  size_t length;
  char *path = get_c_string(env, argv[0], &length);
  if (path == NULL) return NULL;
  Database *database = calloc(1, sizeof *database);
  if (database == NULL) {
    sqlite3_free(path);
    return throw_nomem(env);
  }
  database->references = 1;
  int rc = sqlite3_open_v2(path, &database->db, flags | SQLITE_OPEN_NOMUTEX,
                           NULL);
  sqlite3_free(path);
  if (rc != SQLITE_OK) {
    // Without memory for a connection, SQLite returns no handle.
    if (database->db == NULL)
      throw_code(env, sqlite3_errstr(rc), rc);
    else
      throw_sqlite_error(env, database->db);
    release_database(database);
    return NULL;
  }
  return create_handle(env, database, &database_tag, collect_database);
}

// The codec VFS openCodec opens databases on.
static const char codec_vfs_name[] = "evolu-codec";

// The crash copy's VFS, whose pAppData is the default VFS, and the codec VFS
// over it.
static const char crash_copy_vfs_name[] = "evolu-crash-copy";
static const char crash_copy_codec_vfs_name[] = "evolu-codec-crash-copy";

// The crash copy an open on this thread passes to its database file.
static _Thread_local CrashCopy *pending_crash_copy;

// The file control through which a journal gets its database's crash copy,
// which the codec passes to the file under it.
#define CRASH_COPY_FCNTL 0x45766f6c

typedef struct {
  sqlite3_file base;
  // The inner VFS's file, which follows this struct.
  sqlite3_file *inner;
  CrashCopy *crash_copy;
} CrashCopyFile;

#define CRASH_COPY_FILE_SIZE ((sizeof(CrashCopyFile) + 7) & ~(size_t)7)

static int crash_copy_write(sqlite3_file *base, const void *buffer, int amount,
                            sqlite3_int64 offset) {
  CrashCopyFile *file = (CrashCopyFile *)base;
  CrashCopy *crash_copy = file->crash_copy;
  if (crash_copy == NULL || ++crash_copy->writes != crash_copy->write)
    return file->inner->pMethods->xWrite(file->inner, buffer, amount, offset);
  // The database and its journal, when it has one, as they are now: the
  // database through its file and the journal, which SQLite never locks, with
  // stdio. A step that fails fails the write.
  sqlite3_file *database = crash_copy->database_file;
  char *journal = sqlite3_mprintf("%s-journal", crash_copy->database);
  char *copy_journal = sqlite3_mprintf("%s-journal", crash_copy->copy);
  sqlite3_int64 size = 0;
  FILE *output =
      journal != NULL && copy_journal != NULL &&
              database->pMethods->xFileSize(database, &size) == SQLITE_OK
          ? fopen(crash_copy->copy, "wb")
          : NULL;
  bool ok = output != NULL;
  char bytes[65536];
  const sqlite3_int64 chunk = (sqlite3_int64)sizeof bytes;
  for (sqlite3_int64 at = 0; ok && at < size; at += chunk) {
    int read = (int)(size - at < chunk ? size - at : chunk);
    ok = database->pMethods->xRead(database, bytes, read, at) == SQLITE_OK &&
         fwrite(bytes, 1, (size_t)read, output) == (size_t)read;
  }
  if (output != NULL) ok = fclose(output) == 0 && ok;
  if (ok) {
    remove(copy_journal);
    FILE *input = fopen(journal, "rb");
    if (input != NULL) {
      output = fopen(copy_journal, "wb");
      ok = output != NULL;
      size_t read;
      while (ok && (read = fread(bytes, 1, sizeof bytes, input)) > 0)
        ok = fwrite(bytes, 1, read, output) == read;
      ok = ok && !ferror(input);
      fclose(input);
      if (output != NULL) ok = fclose(output) == 0 && ok;
    }
  }
  sqlite3_free(journal);
  sqlite3_free(copy_journal);
  if (!ok) return SQLITE_IOERR_WRITE;
  return file->inner->pMethods->xWrite(file->inner, buffer, amount, offset);
}

static int crash_copy_file_control(sqlite3_file *base, int op, void *arg) {
  CrashCopyFile *file = (CrashCopyFile *)base;
  if (op != CRASH_COPY_FCNTL)
    return file->inner->pMethods->xFileControl(file->inner, op, arg);
  *(CrashCopy **)arg = file->crash_copy;
  return SQLITE_OK;
}

#define CRASH_COPY_FORWARD(name, parameters, arguments)                        \
  static int crash_copy_##name parameters {                                    \
    sqlite3_file *inner = ((CrashCopyFile *)base)->inner;                      \
    return inner->pMethods->x##name arguments;                                 \
  }

CRASH_COPY_FORWARD(Close, (sqlite3_file * base), (inner))
CRASH_COPY_FORWARD(Read,
                   (sqlite3_file * base, void *buffer, int amount,
                    sqlite3_int64 offset),
                   (inner, buffer, amount, offset))
CRASH_COPY_FORWARD(Truncate, (sqlite3_file * base, sqlite3_int64 size),
                   (inner, size))
CRASH_COPY_FORWARD(Sync, (sqlite3_file * base, int flags), (inner, flags))
CRASH_COPY_FORWARD(FileSize, (sqlite3_file * base, sqlite3_int64 *size),
                   (inner, size))
CRASH_COPY_FORWARD(Lock, (sqlite3_file * base, int level), (inner, level))
CRASH_COPY_FORWARD(Unlock, (sqlite3_file * base, int level), (inner, level))
CRASH_COPY_FORWARD(CheckReservedLock, (sqlite3_file * base, int *result),
                   (inner, result))
CRASH_COPY_FORWARD(SectorSize, (sqlite3_file * base), (inner))
CRASH_COPY_FORWARD(DeviceCharacteristics, (sqlite3_file * base), (inner))

static const sqlite3_io_methods crash_copy_io_methods = {
    1,
    crash_copy_Close,
    crash_copy_Read,
    crash_copy_write,
    crash_copy_Truncate,
    crash_copy_Sync,
    crash_copy_FileSize,
    crash_copy_Lock,
    crash_copy_Unlock,
    crash_copy_CheckReservedLock,
    crash_copy_file_control,
    crash_copy_SectorSize,
    crash_copy_DeviceCharacteristics,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
};

static int crash_copy_open(sqlite3_vfs *vfs, sqlite3_filename name,
                           sqlite3_file *base, int flags, int *out_flags) {
  sqlite3_vfs *inner_vfs = vfs->pAppData;
  CrashCopyFile *file = (CrashCopyFile *)base;
  file->inner = (sqlite3_file *)((char *)file + CRASH_COPY_FILE_SIZE);
  file->crash_copy = NULL;
  if (flags & SQLITE_OPEN_MAIN_DB) {
    file->crash_copy = pending_crash_copy;
    if (file->crash_copy != NULL) file->crash_copy->database = name;
  } else if (flags & SQLITE_OPEN_MAIN_JOURNAL) {
    sqlite3_file *database = sqlite3_database_file_object(name);
    database->pMethods->xFileControl(database, CRASH_COPY_FCNTL,
                                     &file->crash_copy);
  }
  int rc = inner_vfs->xOpen(inner_vfs, name, file->inner, flags, out_flags);
  if (rc != SQLITE_OK) {
    if (file->inner->pMethods != NULL)
      file->inner->pMethods->xClose(file->inner);
    base->pMethods = NULL;
    return rc;
  }
  if ((flags & SQLITE_OPEN_MAIN_DB) && file->crash_copy != NULL)
    file->crash_copy->database_file = file->inner;
  base->pMethods = &crash_copy_io_methods;
  return SQLITE_OK;
}

// Creates `{ type, pageNumber }` for a recorded failure, or null for none.
static bool create_codec_failure(napi_env env,
                                 const evolu_codec_failure *failure,
                                 napi_value *result) {
  const char *type = NULL;
  switch (failure->type) {
  case EVOLU_CODEC_FAILURE_NONE:
    return napi_get_null(env, result) == napi_ok;
  case EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION:
    type = "PageAuthentication";
    break;
  case EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED:
    type = "EncryptionUnsupported";
    break;
  case EVOLU_CODEC_FAILURE_RANDOM:
    type = "Random";
    break;
  }
  napi_value type_value, page_number;
  return type != NULL && napi_create_object(env, result) == napi_ok &&
         napi_create_string_utf8(env, type, NAPI_AUTO_LENGTH, &type_value) ==
             napi_ok &&
         napi_create_uint32(env, failure->page_number, &page_number) ==
             napi_ok &&
         napi_set_named_property(env, *result, "type", type_value) ==
             napi_ok &&
         napi_set_named_property(env, *result, "pageNumber", page_number) ==
             napi_ok;
}

static napi_value js_open_codec(napi_env env, napi_callback_info info) {
  napi_value argv[4];
  if (!get_args(env, info, 4, argv)) return NULL;
  napi_valuetype flags_type;
  if (napi_typeof(env, argv[2], &flags_type) != napi_ok) return fail(env);
  int flags = 0;
  if (flags_type != napi_undefined && !get_int(env, argv[2], &flags))
    return NULL;
  napi_valuetype key_type;
  if (napi_typeof(env, argv[1], &key_type) != napi_ok) return fail(env);
  void *key = NULL;
  if (key_type != napi_null) {
    bool is_typed_array = false;
    if (napi_is_typedarray(env, argv[1], &is_typed_array) != napi_ok)
      return fail(env);
    napi_typedarray_type type = napi_int8_array;
    size_t length = 0;
    if (is_typed_array &&
        napi_get_typedarray_info(env, argv[1], &type, &length, &key, NULL,
                                 NULL) != napi_ok)
      return fail(env);
    if (!is_typed_array || type != napi_uint8_array) {
      napi_throw_type_error(env, NULL, "expected a Uint8Array key or null");
      return NULL;
    }
    if (length != EVOLU_CODEC_KEY_SIZE) {
      napi_throw_range_error(env, NULL, "expected a key of 32 bytes");
      return NULL;
    }
  }
  napi_valuetype crash_copy_type;
  if (napi_typeof(env, argv[3], &crash_copy_type) != napi_ok) return fail(env);
  CrashCopy *crash_copy = NULL;
  if (crash_copy_type != napi_undefined) {
    napi_value write, copy;
    size_t copy_length;
    crash_copy = calloc(1, sizeof *crash_copy);
    if (crash_copy == NULL) return throw_nomem(env);
    if (napi_get_named_property(env, argv[3], "write", &write) != napi_ok ||
        napi_get_named_property(env, argv[3], "copy", &copy) != napi_ok) {
      free(crash_copy);
      return fail(env);
    }
    if (!get_int(env, write, &crash_copy->write) ||
        (crash_copy->copy = get_c_string(env, copy, &copy_length)) == NULL) {
      free(crash_copy);
      return NULL;
    }
  }
  size_t length;
  char *path = get_c_string(env, argv[0], &length);
  if (path == NULL) {
    if (crash_copy != NULL) {
      sqlite3_free(crash_copy->copy);
      free(crash_copy);
    }
    return NULL;
  }
  const char *vfs =
      crash_copy == NULL ? codec_vfs_name : crash_copy_codec_vfs_name;
  int rc = SQLITE_OK;
  if (crash_copy == NULL) {
    rc = evolu_codec_register(codec_vfs_name, NULL);
  } else {
    // The crash copy's VFS and the codec VFS over it, registered once.
    static sqlite3_vfs crash_copy_vfs;
    sqlite3_mutex *mutex = sqlite3_mutex_alloc(SQLITE_MUTEX_STATIC_APP3);
    sqlite3_mutex_enter(mutex);
    if (sqlite3_vfs_find(crash_copy_vfs_name) == NULL) {
      sqlite3_vfs *inner = sqlite3_vfs_find(NULL);
      crash_copy_vfs = *inner;
      crash_copy_vfs.zName = crash_copy_vfs_name;
      crash_copy_vfs.pNext = NULL;
      crash_copy_vfs.pAppData = inner;
      crash_copy_vfs.szOsFile = (int)CRASH_COPY_FILE_SIZE + inner->szOsFile;
      crash_copy_vfs.xOpen = crash_copy_open;
      rc = sqlite3_vfs_register(&crash_copy_vfs, 0);
    }
    if (rc == SQLITE_OK)
      rc = evolu_codec_register(crash_copy_codec_vfs_name, crash_copy_vfs_name);
    sqlite3_mutex_leave(mutex);
  }
  Database *database = rc == SQLITE_OK ? calloc(1, sizeof *database) : NULL;
  if (database == NULL) {
    sqlite3_free(path);
    if (crash_copy != NULL) {
      sqlite3_free(crash_copy->copy);
      free(crash_copy);
    }
    return rc == SQLITE_OK ? throw_nomem(env)
                           : throw_code(env, sqlite3_errstr(rc), rc);
  }
  database->references = 1;
  database->crash_copy = crash_copy;
  pending_crash_copy = crash_copy;
  rc = evolu_codec_open(path, &database->db, vfs, key, flags);
  pending_crash_copy = NULL;
  sqlite3_free(path);
  if (rc == SQLITE_OK)
    return create_handle(env, database, &database_tag, collect_database);
  napi_value error, codec_failure;
  evolu_codec_failure failure = {EVOLU_CODEC_FAILURE_NONE, 0};
  // Without memory for a connection, SQLite returns no handle, and a key
  // without a database file to take it fails no SQLite call.
  bool created = create_code_error(
      env,
      database->db != NULL && sqlite3_extended_errcode(database->db) == rc
          ? sqlite3_errmsg(database->db)
          : sqlite3_errstr(rc),
      rc, &error);
  if (database->db != NULL)
    evolu_codec_take_failure(database->db, &failure);
  release_database(database);
  if (!created) return fail(env);
  if (failure.type != EVOLU_CODEC_FAILURE_NONE &&
      (!create_codec_failure(env, &failure, &codec_failure) ||
       napi_set_named_property(env, error, "codecFailure", codec_failure) !=
           napi_ok))
    return fail(env);
  if (napi_throw(env, error) != napi_ok) return fail(env);
  return NULL;
}

static napi_value js_take_codec_failure(napi_env env,
                                        napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv)) return NULL;
  Database *database = get_open_database(env, argv[0]);
  if (database == NULL) return NULL;
  evolu_codec_failure failure = {EVOLU_CODEC_FAILURE_NONE, 0};
  int rc = evolu_codec_take_failure(database->db, &failure);
  if (rc != SQLITE_OK && rc != SQLITE_NOTFOUND)
    return throw_code(env, sqlite3_errstr(rc), rc);
  napi_value result;
  if (!create_codec_failure(env, &failure, &result)) return fail(env);
  return result;
}

static napi_value js_exec(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  if (!get_args(env, info, 2, argv)) return NULL;
  Database *database = get_open_database(env, argv[0]);
  if (database == NULL) return NULL;
  size_t length;
  char *sql = get_c_string(env, argv[1], &length);
  if (sql == NULL) return NULL;
  int rc = sqlite3_exec(database->db, sql, NULL, NULL, NULL);
  sqlite3_free(sql);
  if (rc != SQLITE_OK) return throw_sqlite_error(env, database->db);
  return undefined(env);
}

static napi_value js_prepare(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  if (!get_args(env, info, 2, argv)) return NULL;
  Database *database = get_open_database(env, argv[0]);
  if (database == NULL) return NULL;
  size_t length;
  char *sql = get_c_string(env, argv[1], &length);
  if (sql == NULL) return NULL;
  // SQLite takes the length, with the terminator, as an int.
  if (length >= 0x7fffffff) {
    sqlite3_free(sql);
    return throw_code(env, sqlite3_errstr(SQLITE_TOOBIG), SQLITE_TOOBIG);
  }
  sqlite3_stmt *stmt = NULL;
  const char *tail = NULL;
  int rc =
      sqlite3_prepare_v3(database->db, sql, (int)length + 1, 0, &stmt, &tail);
  if (rc != SQLITE_OK) {
    sqlite3_free(sql);
    return throw_sqlite_error(env, database->db);
  }
  const char *rest = tail + strspn(tail, " \t\n\f\r;");
  bool trailing = *rest != 0;
  sqlite3_free(sql);
  if (stmt == NULL) {
    napi_throw_error(env, NULL, "SQL has no statement");
    return NULL;
  }
  if (trailing) {
    sqlite3_finalize(stmt);
    napi_throw_error(env, NULL,
                     "only whitespace and semicolons may follow the statement");
    return NULL;
  }
  Statement *statement = calloc(1, sizeof *statement);
  if (statement == NULL) {
    sqlite3_finalize(stmt);
    return throw_nomem(env);
  }
  statement->stmt = stmt;
  statement->database = database;
  statement->next = database->statements;
  if (database->statements != NULL) database->statements->previous = statement;
  database->statements = statement;
  database->references++;
  return create_handle(env, statement, &statement_tag, collect_statement);
}

// Binds a JS value and returns SQLite's result code, or -1 with an exception
// pending.
static int bind_value(napi_env env, sqlite3_stmt *stmt, int index,
                      napi_value value) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok) return fail_code(env);
  switch (type) {
  case napi_null:
    return sqlite3_bind_null(stmt, index);
  case napi_number: {
    double number;
    if (napi_get_value_double(env, value, &number) != napi_ok)
      return fail_code(env);
    // Number.isSafeInteger: the range check comes first, so the cast is
    // defined, and it fails for NaN.
    if (number >= -MAX_SAFE_INTEGER && number <= MAX_SAFE_INTEGER &&
        (double)(sqlite3_int64)number == number)
      return sqlite3_bind_int64(stmt, index, (sqlite3_int64)number);
    return sqlite3_bind_double(stmt, index, number);
  }
  case napi_bigint: {
    int64_t integer;
    bool lossless;
    if (napi_get_value_bigint_int64(env, value, &integer, &lossless) !=
        napi_ok)
      return fail_code(env);
    if (!lossless) {
      napi_throw_range_error(env, NULL, "bigint outside the int64 range");
      return -1;
    }
    return sqlite3_bind_int64(stmt, index, integer);
  }
  case napi_string: {
    size_t length;
    char *text = get_utf8(env, value, &length);
    if (text == NULL) return -1;
    // SQLite frees the text with sqlite3_free, also when binding fails.
    return sqlite3_bind_text64(stmt, index, text, length, sqlite3_free,
                               SQLITE_UTF8);
  }
  case napi_object: {
    bool is_typed_array;
    if (napi_is_typedarray(env, value, &is_typed_array) != napi_ok)
      return fail_code(env);
    if (!is_typed_array) break;
    napi_typedarray_type array_type;
    size_t length;
    void *data;
    if (napi_get_typedarray_info(env, value, &array_type, &length, &data, NULL,
                                 NULL) != napi_ok)
      return fail_code(env);
    if (array_type != napi_uint8_array) break;
    // An empty array can have no data, and a NULL pointer would bind NULL.
    static const char empty = 0;
    return sqlite3_bind_blob64(stmt, index, data != NULL ? data : &empty,
                               length, SQLITE_TRANSIENT);
  }
  default:
    break;
  }
  napi_throw_type_error(
      env, NULL, "expected null, a number, a bigint, a string or a Uint8Array");
  return -1;
}

static napi_value js_bind(napi_env env, napi_callback_info info) {
  napi_value argv[3];
  if (!get_args(env, info, 3, argv)) return NULL;
  Statement *statement = get_live_statement(env, argv[0]);
  if (statement == NULL) return NULL;
  int index;
  if (!get_int(env, argv[1], &index)) return NULL;
  // SQLite's bind functions compute the index less 1, which overflows for the
  // smallest int, so an index below 1 fails here as SQLite would fail it.
  if (index < 1)
    return throw_code(env, sqlite3_errstr(SQLITE_RANGE), SQLITE_RANGE);
  int rc = bind_value(env, statement->stmt, index, argv[2]);
  if (rc < 0) return NULL;
  if (rc != SQLITE_OK)
    return throw_sqlite_error(env, sqlite3_db_handle(statement->stmt));
  return undefined(env);
}

static napi_value js_step(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv)) return NULL;
  Statement *statement = get_live_statement(env, argv[0]);
  if (statement == NULL) return NULL;
  int rc = sqlite3_step(statement->stmt);
  statement->has_row = rc == SQLITE_ROW;
  if (rc != SQLITE_ROW && rc != SQLITE_DONE)
    return throw_sqlite_error(env, sqlite3_db_handle(statement->stmt));
  napi_value result;
  if (napi_get_boolean(env, statement->has_row, &result) != napi_ok)
    return fail(env);
  return result;
}

static napi_value js_column_count(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv)) return NULL;
  Statement *statement = get_live_statement(env, argv[0]);
  if (statement == NULL) return NULL;
  napi_value result;
  if (napi_create_int32(env, sqlite3_column_count(statement->stmt), &result) !=
      napi_ok)
    return fail(env);
  return result;
}

static napi_value js_column_name(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  if (!get_args(env, info, 2, argv)) return NULL;
  Statement *statement = get_live_statement(env, argv[0]);
  if (statement == NULL) return NULL;
  int index;
  if (!get_int(env, argv[1], &index)) return NULL;
  if (index < 0 || index >= sqlite3_column_count(statement->stmt)) {
    napi_throw_range_error(env, NULL, "column index out of range");
    return NULL;
  }
  const char *name = sqlite3_column_name(statement->stmt, index);
  if (name == NULL) return throw_nomem(env);
  napi_value result;
  if (napi_create_string_utf8(env, name, NAPI_AUTO_LENGTH, &result) != napi_ok)
    return fail(env);
  return result;
}

static napi_value js_changes(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv)) return NULL;
  Database *database = get_open_database(env, argv[0]);
  if (database == NULL) return NULL;
  napi_value result;
  if (napi_create_int64(env, sqlite3_changes64(database->db), &result) !=
      napi_ok)
    return fail(env);
  return result;
}

static napi_value js_column(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  if (!get_args(env, info, 2, argv)) return NULL;
  Statement *statement = get_live_statement(env, argv[0]);
  if (statement == NULL) return NULL;
  int index;
  if (!get_int(env, argv[1], &index)) return NULL;
  if (!statement->has_row) {
    napi_throw_error(env, NULL, "statement has no row");
    return NULL;
  }
  sqlite3_stmt *stmt = statement->stmt;
  if (index < 0 || index >= sqlite3_column_count(stmt)) {
    napi_throw_range_error(env, NULL, "column index out of range");
    return NULL;
  }
  napi_value result;
  napi_status status;
  switch (sqlite3_column_type(stmt, index)) {
  case SQLITE_INTEGER: {
    sqlite3_int64 value = sqlite3_column_int64(stmt, index);
    status = value >= -MAX_SAFE_INTEGER && value <= MAX_SAFE_INTEGER
                 ? napi_create_int64(env, value, &result)
                 : napi_create_bigint_int64(env, value, &result);
    break;
  }
  case SQLITE_FLOAT:
    status = napi_create_double(env, sqlite3_column_double(stmt, index),
                                &result);
    break;
  case SQLITE_TEXT: {
    // The pointer first, then the length of the text it points to.
    const unsigned char *text = sqlite3_column_text(stmt, index);
    // With the type read first, NULL is SQLITE_NOMEM, even empty text being
    // NUL-terminated, and after it the length is 0.
    if (text == NULL) return throw_nomem(env);
    int length = sqlite3_column_bytes(stmt, index);
    status = napi_create_string_utf8(env, (const char *)text, (size_t)length,
                                     &result);
    break;
  }
  case SQLITE_BLOB: {
    // The length first: a BLOB's converts nothing, while a zeroblob that
    // sqlite3_column_blob fails to expand becomes NULL, of length 0.
    int length = sqlite3_column_bytes(stmt, index);
    const void *blob = sqlite3_column_blob(stmt, index);
    // NULL for an empty BLOB, and for a non-empty one only on SQLITE_NOMEM.
    if (blob == NULL && length > 0) return throw_nomem(env);
    void *data;
    napi_value buffer;
    if (napi_create_arraybuffer(env, (size_t)length, &data, &buffer) !=
        napi_ok)
      return fail(env);
    if (length > 0) memcpy(data, blob, (size_t)length);
    status = napi_create_typedarray(env, napi_uint8_array, (size_t)length,
                                    buffer, 0, &result);
    break;
  }
  default: // SQLITE_NULL
    status = napi_get_null(env, &result);
    break;
  }
  if (status != napi_ok) return fail(env);
  return result;
}

static napi_value js_reset(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv)) return NULL;
  Statement *statement = get_live_statement(env, argv[0]);
  if (statement == NULL) return NULL;
  bool had_row = statement->has_row;
  statement->has_row = false;
  if (sqlite3_reset(statement->stmt) != SQLITE_OK && had_row)
    return throw_sqlite_error(env, statement->database->db);
  return undefined(env);
}

static napi_value js_finalize(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv)) return NULL;
  Statement *statement = get_statement(env, argv[0]);
  if (statement == NULL) return NULL;
  bool had_row = statement->has_row;
  napi_value error = NULL;
  int rc = finalize_statement_with(statement, env, had_row ? &error : NULL);
  if (rc == SQLITE_OK || !had_row) return undefined(env);
  if (error == NULL || napi_throw(env, error) != napi_ok) return fail(env);
  return NULL;
}

static napi_value js_close(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv)) return NULL;
  Database *database = get_database(env, argv[0]);
  if (database == NULL) return NULL;
  if (database->db == NULL) return undefined(env);
  // The handle keeps its reference, so finalizing never frees the struct.
  napi_value error = NULL;
  int first_rc = SQLITE_OK;
  while (database->statements != NULL) {
    Statement *statement = database->statements;
    bool keeps_error = statement->has_row && first_rc == SQLITE_OK;
    int rc = finalize_statement_with(statement, env,
                                     keeps_error ? &error : NULL);
    if (keeps_error && rc != SQLITE_OK) first_rc = rc;
  }
  // With no statement left, SQLite closes the connection at once.
  sqlite3_close_v2(database->db);
  database->db = NULL;
  if (first_rc == SQLITE_OK) return undefined(env);
  if (error == NULL || napi_throw(env, error) != napi_ok) return fail(env);
  return NULL;
}

// node/binding.c's createBinding.
napi_value evolu_node_create_binding(napi_env env, napi_callback_info info);

static void write_log(sqlite3_context *context, int argc,
                      sqlite3_value **argv) {
  (void)argc;
  (void)argv;
  int rc = sqlite3_exec(sqlite3_context_db_handle(context),
                        "insert into log values (1), (2)", NULL, NULL, NULL);
  if (rc != SQLITE_OK)
    sqlite3_result_error_code(context, rc);
  else
    sqlite3_result_null(context);
}

static int register_write_log(sqlite3 *db, char **error,
                              const struct sqlite3_api_routines *api) {
  (void)error;
  (void)api;
  return sqlite3_create_function_v2(db, "write_log", 0, SQLITE_UTF8, NULL,
                                    write_log, NULL, NULL, NULL);
}

static napi_value js_auto_register_write_log(napi_env env,
                                             napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv)) return NULL;
  bool is_registered;
  if (napi_get_value_bool(env, argv[0], &is_registered) != napi_ok)
    return fail(env);
  if (!is_registered) {
    sqlite3_reset_auto_extension();
    return undefined(env);
  }
  // SQLite calls an entry point with the connection, as a loaded extension's.
  int rc = sqlite3_auto_extension((void (*)(void))register_write_log);
  if (rc != SQLITE_OK) return throw_code(env, sqlite3_errstr(rc), rc);
  return undefined(env);
}

// Whether this build has AddressSanitizer and UndefinedBehaviorSanitizer,
// which the tests check against the build they asked for.
#if defined(__has_feature)
#if __has_feature(address_sanitizer) &&                                        \
    __has_feature(undefined_behavior_sanitizer)
#define IS_SANITIZED true
#endif
#endif
#ifndef IS_SANITIZED
#define IS_SANITIZED false
#endif

NAPI_MODULE_INIT() {
  napi_value is_sanitized;
  if (napi_get_boolean(env, IS_SANITIZED, &is_sanitized) != napi_ok)
    return fail(env);
  napi_property_descriptor properties[] = {
      {"isSanitized", NULL, NULL, NULL, NULL, is_sanitized, napi_enumerable,
       NULL},
      {"autoRegisterWriteLog", NULL, js_auto_register_write_log, NULL, NULL,
       NULL, napi_enumerable, NULL},
      {"libversion", NULL, js_libversion, NULL, NULL, NULL, napi_enumerable,
       NULL},
      {"sourceid", NULL, js_sourceid, NULL, NULL, NULL, napi_enumerable, NULL},
      {"compileOptionUsed", NULL, js_compile_option_used, NULL, NULL, NULL,
       napi_enumerable, NULL},
      {"createBinding", NULL, evolu_node_create_binding, NULL, NULL, NULL,
       napi_enumerable, NULL},
      {"open", NULL, js_open, NULL, NULL, NULL, napi_enumerable, NULL},
      {"openCodec", NULL, js_open_codec, NULL, NULL, NULL, napi_enumerable,
       NULL},
      {"takeCodecFailure", NULL, js_take_codec_failure, NULL, NULL, NULL,
       napi_enumerable, NULL},
      {"exec", NULL, js_exec, NULL, NULL, NULL, napi_enumerable, NULL},
      {"prepare", NULL, js_prepare, NULL, NULL, NULL, napi_enumerable, NULL},
      {"bind", NULL, js_bind, NULL, NULL, NULL, napi_enumerable, NULL},
      {"step", NULL, js_step, NULL, NULL, NULL, napi_enumerable, NULL},
      {"columnCount", NULL, js_column_count, NULL, NULL, NULL, napi_enumerable,
       NULL},
      {"column", NULL, js_column, NULL, NULL, NULL, napi_enumerable, NULL},
      {"columnName", NULL, js_column_name, NULL, NULL, NULL, napi_enumerable,
       NULL},
      {"changes", NULL, js_changes, NULL, NULL, NULL, napi_enumerable, NULL},
      {"reset", NULL, js_reset, NULL, NULL, NULL, napi_enumerable, NULL},
      {"finalize", NULL, js_finalize, NULL, NULL, NULL, napi_enumerable, NULL},
      {"close", NULL, js_close, NULL, NULL, NULL, napi_enumerable, NULL},
  };
  if (napi_define_properties(env, exports,
                             sizeof properties / sizeof properties[0],
                             properties) != napi_ok)
    return fail(env);
  return exports;
}
