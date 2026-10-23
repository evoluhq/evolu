/*
 * The N-API mirror of React Native's SQLite binding: the JavaScript interface
 * that @evolu/react-native's src/sqlite/Binding.ts types and describes, which
 * its JSI adapter implements under Hermes, here over Node-API and the same
 * binding layer, binding/evolu_database.h, whose public headers are all it
 * includes. So the TypeScript driver runs in Node.js against the real C, and
 * the Node.js binding starts from it. node/addon.c exports it as
 * createBinding, and @evolu/react-native's test/bindingConformance.ts pins
 * that both adapters behave alike. What is particular to Node-API:
 *
 * - createBinding checks the build and returns a binding object whose
 *   functions keep no state of their own.
 * - Databases and statements are instances of two classes whose prototypes
 *   hold the methods, each with a type tag and its C struct wrapped, so a
 *   method called on another kind of object throws a TypeError. Their
 *   constructors throw when JavaScript calls them.
 * - Each Node.js environment that loads the addon, such as a worker thread,
 *   keeps a list of the connections it opened. A collected handle only drops
 *   its reference, so no SQLite call runs from the garbage collector: a
 *   connection whose handle is gone stays open, holding its file, until the
 *   environment's teardown closes every connection it still has, as a JSI
 *   runtime's teardown does.
 * - Strings convert with napi_get_value_string_utf8, which replaces a lone
 *   surrogate with U+FFFD, as text binds it; prepare refuses SQL with one
 *   first.
 * - Reading a parameter, creating a row object, setting a row's column and
 *   appending a row to a run's rows can run JavaScript, such as a getter or a
 *   setter, which could finalize the statement or close its database. So a
 *   run or a bind reads every parameter before it binds one, and a step or a
 *   run checks the statement again after each of the others, throwing that
 *   it's finalized before SQLite could use it again.
 * - Rows are created with the Object.create of the environment's first
 *   createBinding, which gives them a null prototype, and keys from the
 *   column names the statement caches.
 * - An export is an external ArrayBuffer whose finalizer wipes and frees it,
 *   with its size reported as external memory.
 */
#include <node_api.h>

#include "evolu_database.h"
#include "evolu_xchacha.h"

#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// The version of the interface Binding.ts types, which its loader checks.
#define ABI_VERSION 1

// The largest integer a JS number holds exactly, Number.MAX_SAFE_INTEGER.
#define MAX_SAFE_INTEGER 9007199254740991.0

typedef struct Database Database;

// What an environment keeps: the connections it opened, the classes of the
// handles, and Object.create.
typedef struct {
  Database *databases;
  napi_ref database_class;
  napi_ref statement_class;
  napi_ref object_create;
  // Whether C, not JavaScript, calls a class's constructor.
  bool is_constructing;
} Environment;

struct Database {
  evolu_database *database; // NULL once closed.
  // How many closes it took, each finalizing every statement, also when
  // SQLite then refused to close it.
  int closes;
  Environment *environment;
  // Its neighbors in the environment's list, which holds it while it's open.
  Database *previous;
  Database *next;
  // Its handle, its statements' handles, and the list while it's open.
  size_t references;
};

typedef struct {
  char *bytes;
  size_t size;
} ColumnName;

typedef struct {
  // NULL once finalized, and finalized by the close of its database.
  sqlite3_stmt *stmt;
  Database *database;
  // Its database's closes when it was prepared; a later close finalized it.
  int closes;
  int parameter_count;
  // Whether the last step returned a row.
  bool has_row;
  // The column names, read for the preparation that reprepares counts, or
  // -1 columns before they're read.
  int column_count;
  int reprepares;
  ColumnName *names;
} Statement;

// Random values that mark the handles of this binding by kind.
static const napi_type_tag database_tag = {0x5d1c7a2e93b4f608ULL,
                                           0xa47e2c19d03b86f5ULL};
static const napi_type_tag statement_tag = {0x31f9b6c4e8a20d57ULL,
                                            0x6c0e8d4a2f71b93eULL};

// Returns NULL, throwing an Error for the Node-API call that just failed
// unless it left an exception pending.
static void *fail(napi_env env) {
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

static void *throw_type_error(napi_env env, const char *message) {
  napi_throw_type_error(env, NULL, message);
  return NULL;
}

static void *throw_plain_error(napi_env env, const char *message) {
  napi_throw_error(env, NULL, message);
  return NULL;
}

// Defines an enumerable data property, as an object literal has.
static bool define(napi_env env, napi_value object, const char *name,
                   napi_value value) {
  napi_property_descriptor property = {
      name, NULL, NULL, NULL, NULL, value,
      napi_writable | napi_enumerable | napi_configurable, NULL};
  return napi_define_properties(env, object, 1, &property) == napi_ok;
}

// Creates { type }.
static bool create_typed(napi_env env, const char *type, napi_value *result) {
  napi_value type_value;
  return napi_create_object(env, result) == napi_ok &&
         napi_create_string_utf8(env, type, NAPI_AUTO_LENGTH, &type_value) ==
             napi_ok &&
         define(env, *result, "type", type_value);
}

// Creates Binding.ts's NativeSqliteCodecFailure, or null for none.
static bool create_codec_failure(napi_env env,
                                 const evolu_database_codec_failure *failure,
                                 napi_value *result) {
  const char *type = NULL;
  switch (failure->type) {
  case EVOLU_DATABASE_CODEC_FAILURE_NONE:
    return napi_get_null(env, result) == napi_ok;
  case EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION:
    type = "SqlitePageAuthenticationError";
    break;
  case EVOLU_DATABASE_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED:
    type = "SqliteEncryptionUnsupported";
    break;
  case EVOLU_DATABASE_CODEC_FAILURE_RANDOM:
    type = "SqliteRandomSourceError";
    break;
  }
  napi_value error, page_number;
  if (type == NULL || !create_typed(env, type, &error)) return false;
  if (failure->type == EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION &&
      (napi_create_uint32(env, failure->page_number, &page_number) !=
           napi_ok ||
       !define(env, error, "pageNumber", page_number)))
    return false;
  return create_typed(env, "SqliteCodecFailure", result) &&
         define(env, *result, "error", error);
}

// Creates Binding.ts's NativeSqliteError of a record from SQLite.
static bool create_sqlite_error(napi_env env, const char *operation,
                                const evolu_database_error *record,
                                napi_value message, napi_value *result) {
  napi_value operation_value, extended_code, sql_offset, system_errno, cause;
  return create_typed(env, "SqliteError", result) &&
         napi_create_string_utf8(env, operation, NAPI_AUTO_LENGTH,
                                 &operation_value) == napi_ok &&
         napi_create_int32(env, record->code, &extended_code) == napi_ok &&
         (record->sql_offset < 0
              ? napi_get_null(env, &sql_offset)
              : napi_create_int32(env, record->sql_offset, &sql_offset)) ==
             napi_ok &&
         (record->system_errno == 0
              ? napi_get_null(env, &system_errno)
              : napi_create_int32(env, record->system_errno,
                                  &system_errno)) == napi_ok &&
         create_codec_failure(env, &record->codec_failure, &cause) &&
         define(env, *result, "operation", operation_value) &&
         define(env, *result, "extendedCode", extended_code) &&
         define(env, *result, "message", message) &&
         define(env, *result, "sqlOffset", sql_offset) &&
         define(env, *result, "systemErrno", system_errno) &&
         define(env, *result, "cause", cause);
}

// Creates the error a record describes, as Binding.ts describes it: a
// TypeError for an invalid path, and otherwise an Error with the record's
// message and a cause, which, as the constructor's option does, it defines
// unenumerable.
static bool create_record_error(napi_env env, const char *operation,
                                const evolu_database_error *record,
                                napi_value *result) {
  napi_value message, cause;
  if (napi_create_string_utf8(env, record->message, NAPI_AUTO_LENGTH,
                              &message) != napi_ok)
    return false;
  bool created = false;
  switch (record->type) {
  case EVOLU_DATABASE_ERROR_INVALID_PATH:
    return napi_create_type_error(env, NULL, message, result) == napi_ok;
  case EVOLU_DATABASE_ERROR_FILE_HELD:
    created = create_typed(env, "DatabaseFileHeldError", &cause);
    break;
  case EVOLU_DATABASE_ERROR_EMPTY_SQL:
    created = create_typed(env, "SqliteEmptySqlError", &cause);
    break;
  case EVOLU_DATABASE_ERROR_MULTIPLE_STATEMENTS:
    created = create_typed(env, "SqliteMultipleStatementsError", &cause);
    break;
  case EVOLU_DATABASE_ERROR_INVALID_SQL_TEXT:
    created = create_typed(env, "SqliteInvalidSqlText", &cause);
    break;
  case EVOLU_DATABASE_ERROR_NONE:
  case EVOLU_DATABASE_ERROR_SQLITE:
    created = create_sqlite_error(env, operation, record, message, &cause);
    break;
  }
  napi_property_descriptor property = {
      "cause", NULL, NULL, NULL, NULL, cause,
      napi_writable | napi_configurable, NULL};
  return created && napi_create_error(env, NULL, message, result) == napi_ok &&
         napi_define_properties(env, *result, 1, &property) == napi_ok;
}

// Throws the error of a record, from the binding function operation names,
// clears the record, and returns NULL.
static void *throw_record(napi_env env, const char *operation,
                          evolu_database_error *record) {
  napi_value error;
  bool created = create_record_error(env, operation, record, &error);
  evolu_database_clear_error(record);
  if (!created || napi_throw(env, error) != napi_ok) return fail(env);
  return NULL;
}

// Throws the error of a call on db that returned code.
static void *throw_sqlite(napi_env env, const char *operation, sqlite3 *db,
                          int code) {
  evolu_database_error record;
  evolu_database_set_error(&record, db, code);
  return throw_record(env, operation, &record);
}

// Throws an error the binding found itself.
static void *throw_own(napi_env env, const char *operation,
                       evolu_database_error_type type, int code,
                       const char *message) {
  evolu_database_error record = {
      type, code, message, -1, 0, {EVOLU_DATABASE_CODEC_FAILURE_NONE, 0},
      NULL};
  return throw_record(env, operation, &record);
}

static void *throw_nomem(napi_env env, const char *operation) {
  return throw_own(env, operation, EVOLU_DATABASE_ERROR_SQLITE, SQLITE_NOMEM,
                   sqlite3_errstr(SQLITE_NOMEM));
}

// Reads `count` arguments into argv, missing ones as undefined, and `this`.
static bool get_args(napi_env env, napi_callback_info info, size_t count,
                     napi_value *argv, napi_value *this_value) {
  size_t argc = count;
  if (napi_get_cb_info(env, info, &argc, argv, this_value, NULL) == napi_ok)
    return true;
  fail(env);
  return false;
}

static napi_value undefined(napi_env env) {
  napi_value result;
  if (napi_get_undefined(env, &result) != napi_ok) return fail(env);
  return result;
}

// Returns a string as UTF-8 from sqlite3_malloc64, which a NUL follows, with
// its byte length in *size, or NULL with an exception pending: a TypeError
// with not_string for any other value, or SQLITE_NOMEM for the operation.
static char *get_utf8(napi_env env, napi_value value, const char *not_string,
                      const char *operation, size_t *size) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok) return fail(env);
  if (type != napi_string) return throw_type_error(env, not_string);
  if (napi_get_value_string_utf8(env, value, NULL, 0, size) != napi_ok)
    return fail(env);
  char *text = sqlite3_malloc64(*size + 1);
  if (text == NULL) return throw_nomem(env, operation);
  if (napi_get_value_string_utf8(env, value, text, *size + 1, size) !=
      napi_ok) {
    sqlite3_free(text);
    return fail(env);
  }
  return text;
}

// Whether a string has a lone surrogate, or -1 with an exception pending.
static int has_lone_surrogate(napi_env env, napi_value value,
                              const char *operation) {
  size_t length;
  if (napi_get_value_string_utf16(env, value, NULL, 0, &length) != napi_ok)
    return fail_code(env);
  char16_t *units = malloc((length + 1) * sizeof *units);
  if (units == NULL) {
    throw_nomem(env, operation);
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

// Reads a typed array's bytes: returns 1 for a Uint8Array, 0 for any other
// value, and -1 with an exception pending.
static int get_bytes(napi_env env, napi_value value, uint8_t **data,
                     size_t *size) {
  bool is_typed_array = false;
  if (napi_is_typedarray(env, value, &is_typed_array) != napi_ok)
    return fail_code(env);
  if (!is_typed_array) return 0;
  napi_typedarray_type type;
  void *bytes = NULL;
  if (napi_get_typedarray_info(env, value, &type, size, &bytes, NULL, NULL) !=
      napi_ok)
    return fail_code(env);
  *data = bytes;
  return type == napi_uint8_array;
}

// Reads a Uint8Array of exactly size bytes, or returns false with a TypeError
// with message or another exception pending.
static bool get_exact_bytes(napi_env env, napi_value value, size_t size,
                            const char *message, uint8_t **data) {
  size_t actual = 0;
  int is_bytes = get_bytes(env, value, data, &actual);
  if (is_bytes < 0) return false;
  if (is_bytes && actual == size) return true;
  throw_type_error(env, message);
  return false;
}

// The environment's state, or NULL before its first createBinding or with an
// exception pending.
static Environment *get_environment(napi_env env) {
  void *data = NULL;
  if (napi_get_instance_data(env, &data) != napi_ok) return fail(env);
  return data;
}

// Returns the struct of the handle `this` is, or NULL with a TypeError naming
// what was expected.
static void *get_this(napi_env env, napi_value this_value,
                      const napi_type_tag *tag, const char *expected) {
  napi_valuetype type;
  if (napi_typeof(env, this_value, &type) != napi_ok) return fail(env);
  bool is_tagged = false;
  if (type == napi_object &&
      napi_check_object_type_tag(env, this_value, tag, &is_tagged) != napi_ok)
    return fail(env);
  if (!is_tagged) return throw_type_error(env, expected);
  void *data;
  if (napi_unwrap(env, this_value, &data) != napi_ok) return fail(env);
  return data;
}

static Database *get_open_database(napi_env env, napi_value this_value) {
  Database *database =
      get_this(env, this_value, &database_tag, "Expected a database.");
  if (database == NULL || database->database != NULL) return database;
  return throw_plain_error(env, "The database is closed.");
}

static bool is_live(const Statement *statement) {
  return statement->stmt != NULL && statement->database->database != NULL &&
         statement->closes == statement->database->closes;
}

static Statement *get_live_statement(napi_env env, napi_value this_value) {
  Statement *statement =
      get_this(env, this_value, &statement_tag, "Expected a statement.");
  if (statement == NULL || is_live(statement)) return statement;
  return throw_plain_error(env, "The statement is finalized.");
}

// Drops a reference to a database, freeing it after the last.
static void release_database(Database *database) {
  if (--database->references == 0) free(database);
}

static void unlink_database(Database *database) {
  if (database->previous != NULL)
    database->previous->next = database->next;
  else
    database->environment->databases = database->next;
  if (database->next != NULL) database->next->previous = database->previous;
}

// Closes an open database, which releases its file, and returns SQLite's
// result, keeping it open when SQLite can't close it.
static int close_database(Database *database) {
  // The close finalizes every statement, also when SQLite then refuses it.
  database->closes++;
  int rc = evolu_database_close(database->database);
  if (rc != SQLITE_OK) return rc;
  database->database = NULL;
  unlink_database(database);
  release_database(database);
  return SQLITE_OK;
}

static void free_column_names(Statement *statement) {
  for (int i = 0; i < statement->column_count; i++)
    free(statement->names[i].bytes);
  free(statement->names);
  statement->names = NULL;
  statement->column_count = -1;
}

static void collect_database(napi_env env, void *data, void *hint) {
  (void)env;
  (void)hint;
  release_database(data);
}

// A collected statement only drops its reference; its database's close
// finalizes it.
static void collect_statement(napi_env env, void *data, void *hint) {
  (void)env;
  (void)hint;
  Statement *statement = data;
  free_column_names(statement);
  release_database(statement->database);
  free(statement);
}

static void free_export(napi_env env, void *data, void *hint) {
  size_t size = (size_t)(uintptr_t)hint;
  evolu_database_free_export(data, size);
  int64_t adjusted;
  napi_adjust_external_memory(env, -(int64_t)size, &adjusted);
}

// The environment's teardown closes the connections it still has.
static void finalize_environment(napi_env env, void *data, void *hint) {
  (void)hint;
  Environment *environment = data;
  while (environment->databases != NULL) {
    Database *database = environment->databases;
    // A connection SQLite can't close stays open, outside the list.
    if (close_database(database) != SQLITE_OK) unlink_database(database);
  }
  napi_delete_reference(env, environment->database_class);
  napi_delete_reference(env, environment->statement_class);
  napi_delete_reference(env, environment->object_create);
  free(environment);
}

// Creates a handle of a class, tags it and wraps data in it, or returns NULL
// with an exception pending and data not wrapped.
static napi_value create_handle(napi_env env, Environment *environment,
                                napi_ref class_reference,
                                const napi_type_tag *tag, void *data,
                                napi_finalize collect) {
  napi_value constructor, handle;
  if (napi_get_reference_value(env, class_reference, &constructor) != napi_ok)
    return fail(env);
  environment->is_constructing = true;
  napi_status status = napi_new_instance(env, constructor, 0, NULL, &handle);
  environment->is_constructing = false;
  if (status != napi_ok || napi_type_tag_object(env, handle, tag) != napi_ok ||
      napi_wrap(env, handle, data, collect, NULL, NULL) != napi_ok)
    return fail(env);
  return handle;
}

// Creates the handle of a database just opened, or closes it and returns NULL
// with an exception pending.
static napi_value create_database(napi_env env, evolu_database *opened) {
  Environment *environment = get_environment(env);
  Database *database =
      environment != NULL ? calloc(1, sizeof *database) : NULL;
  if (database == NULL) {
    evolu_database_close(opened);
    return environment != NULL ? throw_nomem(env, "open") : NULL;
  }
  database->database = opened;
  database->environment = environment;
  database->references = 1;
  napi_value handle =
      create_handle(env, environment, environment->database_class,
                    &database_tag, database, collect_database);
  if (handle == NULL) {
    evolu_database_close(opened);
    free(database);
    return NULL;
  }
  database->references++;
  database->next = environment->databases;
  if (database->next != NULL) database->next->previous = database;
  environment->databases = database;
  return handle;
}

// Reads the statement's column names unless it has them for its current
// preparation, which a schema change replaces. Returns false when an
// allocation fails.
static bool read_column_names(Statement *statement) {
  sqlite3_stmt *stmt = statement->stmt;
  int reprepares = sqlite3_stmt_status(stmt, SQLITE_STMTSTATUS_REPREPARE, 0);
  if (statement->column_count >= 0 && reprepares == statement->reprepares)
    return true;
  free_column_names(statement);
  int count = sqlite3_column_count(stmt);
  ColumnName *names = calloc(count > 0 ? (size_t)count : 1, sizeof *names);
  if (names == NULL) return false;
  for (int i = 0; i < count; i++) {
    const char *name = sqlite3_column_name(stmt, i);
    size_t size = name != NULL ? strlen(name) : 0;
    names[i].bytes = name != NULL ? malloc(size + 1) : NULL;
    if (names[i].bytes == NULL) {
      for (int j = 0; j < i; j++) free(names[j].bytes);
      free(names);
      return false;
    }
    memcpy(names[i].bytes, name, size + 1);
    names[i].size = size;
  }
  statement->names = names;
  statement->column_count = count;
  statement->reprepares = reprepares;
  return true;
}

// Creates the row of the statement's last step, or returns NULL with an
// exception pending.
static napi_value create_row(napi_env env, Statement *statement) {
  sqlite3_stmt *stmt = statement->stmt;
  sqlite3 *db = sqlite3_db_handle(stmt);
  if (!read_column_names(statement))
    return throw_sqlite(env, "step", db, SQLITE_NOMEM);
  Environment *environment = statement->database->environment;
  napi_value object_create, receiver, prototype, row;
  if (napi_get_reference_value(env, environment->object_create,
                               &object_create) != napi_ok ||
      napi_get_undefined(env, &receiver) != napi_ok ||
      napi_get_null(env, &prototype) != napi_ok ||
      napi_call_function(env, receiver, object_create, 1, &prototype, &row) !=
          napi_ok)
    return fail(env);
  if (!is_live(statement))
    return throw_plain_error(env, "The statement is finalized.");
  for (int i = 0; i < statement->column_count; i++) {
    napi_value key, value;
    napi_status status;
    // The type first, so a NULL pointer is SQLITE_NOMEM, never SQL NULL.
    switch (sqlite3_column_type(stmt, i)) {
    case SQLITE_INTEGER:
    case SQLITE_FLOAT:
      status = napi_create_double(env, sqlite3_column_double(stmt, i), &value);
      break;
    case SQLITE_TEXT: {
      // The pointer first, then the length of the text it points to.
      const unsigned char *text = sqlite3_column_text(stmt, i);
      if (text == NULL) return throw_sqlite(env, "step", db, SQLITE_NOMEM);
      status = napi_create_string_utf8(
          env, (const char *)text, (size_t)sqlite3_column_bytes(stmt, i),
          &value);
      break;
    }
    case SQLITE_BLOB: {
      // The length first: a zeroblob that sqlite3_column_blob fails to expand
      // becomes NULL.
      int size = sqlite3_column_bytes(stmt, i);
      const void *blob = sqlite3_column_blob(stmt, i);
      if (blob == NULL && size > 0)
        return throw_sqlite(env, "step", db, SQLITE_NOMEM);
      void *data;
      napi_value buffer;
      status = napi_create_arraybuffer(env, (size_t)size, &data, &buffer);
      if (status == napi_ok) {
        if (size > 0) memcpy(data, blob, (size_t)size);
        status = napi_create_typedarray(env, napi_uint8_array, (size_t)size,
                                        buffer, 0, &value);
      }
      break;
    }
    default:
      status = napi_get_null(env, &value);
      break;
    }
    if (status != napi_ok ||
        node_api_create_property_key_utf8(env, statement->names[i].bytes,
                                          statement->names[i].size,
                                          &key) != napi_ok ||
        napi_set_property(env, row, key, value) != napi_ok)
      return fail(env);
    if (!is_live(statement))
      return throw_plain_error(env, "The statement is finalized.");
  }
  return row;
}

// Binds a value and returns SQLite's result, or -1 with an exception pending.
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
    if (!isfinite(number)) break;
    // Number.isSafeInteger: the range check comes first, so the cast is
    // defined.
    if (number >= -MAX_SAFE_INTEGER && number <= MAX_SAFE_INTEGER &&
        (double)(sqlite3_int64)number == number)
      return sqlite3_bind_int64(stmt, index, (sqlite3_int64)number);
    return sqlite3_bind_double(stmt, index, number);
  }
  case napi_string: {
    size_t size;
    char *text = get_utf8(env, value, "", "bind", &size);
    if (text == NULL) return -1;
    // SQLite frees the text with sqlite3_free, also when binding fails.
    return sqlite3_bind_text64(stmt, index, text, size, sqlite3_free,
                               SQLITE_UTF8);
  }
  case napi_object: {
    uint8_t *data = NULL;
    size_t size = 0;
    int is_bytes = get_bytes(env, value, &data, &size);
    if (is_bytes < 0) return -1;
    if (!is_bytes) break;
    // An empty array can have no data, and a NULL pointer would bind NULL.
    static const uint8_t empty = 0;
    return sqlite3_bind_blob64(stmt, index, data != NULL ? data : &empty, size,
                               SQLITE_TRANSIENT);
  }
  default:
    break;
  }
  throw_type_error(
      env,
      "A parameter must be null, a finite number, a string or a Uint8Array.");
  return -1;
}

// Binds an array of exactly the statement's number of parameters, or returns
// false with an exception pending.
static bool bind_parameters(napi_env env, Statement *statement,
                            napi_value parameters) {
  bool is_array = false;
  if (napi_is_array(env, parameters, &is_array) != napi_ok) {
    fail(env);
    return false;
  }
  if (!is_array) {
    throw_type_error(env, "The parameters must be an array.");
    return false;
  }
  uint32_t count;
  if (napi_get_array_length(env, parameters, &count) != napi_ok) {
    fail(env);
    return false;
  }
  if (count != (uint32_t)statement->parameter_count) {
    char message[64];
    snprintf(message, sizeof message, "Expected %d parameters, got %u.",
             statement->parameter_count, count);
    throw_type_error(env, message);
    return false;
  }
  napi_value *values = malloc((count > 0 ? count : 1) * sizeof *values);
  if (values == NULL) {
    throw_nomem(env, "bind");
    return false;
  }
  bool ok = true;
  for (uint32_t i = 0; ok && i < count; i++)
    ok = napi_get_element(env, parameters, i, &values[i]) == napi_ok;
  if (!ok) {
    free(values);
    fail(env);
    return false;
  }
  // Reading an element can run JavaScript, which could have finalized the
  // statement or closed its database.
  if (!is_live(statement)) {
    free(values);
    throw_plain_error(env, "The statement is finalized.");
    return false;
  }
  sqlite3_stmt *stmt = statement->stmt;
  evolu_database_discard_failure(sqlite3_db_handle(stmt));
  for (uint32_t i = 0; ok && i < count; i++) {
    int rc = bind_value(env, stmt, (int)i + 1, values[i]);
    if (rc > 0) throw_sqlite(env, "bind", sqlite3_db_handle(stmt), rc);
    ok = rc == SQLITE_OK;
  }
  free(values);
  return ok;
}

static napi_value js_run(napi_env env, napi_callback_info info) {
  napi_value argv[1], this_value;
  if (!get_args(env, info, 1, argv, &this_value)) return NULL;
  Statement *statement = get_live_statement(env, this_value);
  if (statement == NULL) return NULL;
  if (!bind_parameters(env, statement, argv[0])) {
    if (is_live(statement)) {
      sqlite3_reset(statement->stmt);
      statement->has_row = false;
    }
    return NULL;
  }
  sqlite3_stmt *stmt = statement->stmt;
  sqlite3 *db = sqlite3_db_handle(stmt);
  sqlite3_int64 total_changes = sqlite3_total_changes64(db);
  napi_value rows;
  bool ok = napi_create_array(env, &rows) == napi_ok || fail(env);
  uint32_t count = 0;
  int rc = SQLITE_OK;
  while (ok && (rc = sqlite3_step(stmt)) == SQLITE_ROW) {
    statement->has_row = true;
    // Each row's values go when it's in the array.
    napi_handle_scope scope;
    if (napi_open_handle_scope(env, &scope) != napi_ok) {
      ok = fail(env);
      break;
    }
    napi_value row = create_row(env, statement);
    ok = row != NULL &&
         (napi_set_element(env, rows, count++, row) == napi_ok || fail(env));
    if (ok && !is_live(statement)) {
      throw_plain_error(env, "The statement is finalized.");
      ok = false;
    }
    napi_close_handle_scope(env, scope);
  }
  if (!is_live(statement)) return NULL;
  // A failed step's error, read before the reset repeats it.
  evolu_database_error record;
  if (ok && rc != SQLITE_DONE) evolu_database_set_error(&record, db, rc);
  sqlite3_reset(stmt);
  statement->has_row = false;
  if (!ok) return NULL;
  if (rc != SQLITE_DONE) return throw_record(env, "step", &record);
  // SQLite keeps the count of the last INSERT, UPDATE or DELETE across other
  // statements, and a statement that can't write changes no rows itself.
  sqlite3_int64 changes = sqlite3_total_changes64(db) == total_changes ||
                                   sqlite3_stmt_readonly(stmt)
                               ? 0
                               : sqlite3_changes64(db);
  napi_value result, changes_value;
  if (napi_create_object(env, &result) != napi_ok ||
      napi_create_int64(env, changes, &changes_value) != napi_ok ||
      !define(env, result, "rows", rows) ||
      !define(env, result, "changes", changes_value))
    return fail(env);
  return result;
}

static napi_value js_bind(napi_env env, napi_callback_info info) {
  napi_value argv[1], this_value;
  if (!get_args(env, info, 1, argv, &this_value)) return NULL;
  Statement *statement = get_live_statement(env, this_value);
  if (statement == NULL || !bind_parameters(env, statement, argv[0]))
    return NULL;
  return undefined(env);
}

static napi_value js_step(napi_env env, napi_callback_info info) {
  napi_value this_value;
  if (!get_args(env, info, 0, NULL, &this_value)) return NULL;
  Statement *statement = get_live_statement(env, this_value);
  if (statement == NULL) return NULL;
  sqlite3 *db = sqlite3_db_handle(statement->stmt);
  evolu_database_discard_failure(db);
  int rc = sqlite3_step(statement->stmt);
  statement->has_row = rc == SQLITE_ROW;
  if (rc == SQLITE_ROW) return create_row(env, statement);
  if (rc != SQLITE_DONE) return throw_sqlite(env, "step", db, rc);
  napi_value result;
  if (napi_get_null(env, &result) != napi_ok) return fail(env);
  return result;
}

// Completing a statement whose last step returned a row can fail, as a
// commit; otherwise the code only repeats a failed step's error, or is
// SQLITE_OK after SQLITE_DONE.
static napi_value js_reset(napi_env env, napi_callback_info info) {
  napi_value this_value;
  if (!get_args(env, info, 0, NULL, &this_value)) return NULL;
  Statement *statement = get_live_statement(env, this_value);
  if (statement == NULL) return NULL;
  bool had_row = statement->has_row;
  statement->has_row = false;
  sqlite3 *db = sqlite3_db_handle(statement->stmt);
  evolu_database_discard_failure(db);
  int rc = sqlite3_reset(statement->stmt);
  if (rc != SQLITE_OK && had_row) return throw_sqlite(env, "step", db, rc);
  return undefined(env);
}

static napi_value js_finalize(napi_env env, napi_callback_info info) {
  napi_value this_value;
  if (!get_args(env, info, 0, NULL, &this_value)) return NULL;
  Statement *statement = get_live_statement(env, this_value);
  if (statement == NULL) return NULL;
  bool had_row = statement->has_row;
  sqlite3 *db = sqlite3_db_handle(statement->stmt);
  evolu_database_discard_failure(db);
  int rc = sqlite3_finalize(statement->stmt);
  statement->stmt = NULL;
  statement->has_row = false;
  free_column_names(statement);
  if (rc != SQLITE_OK && had_row) return throw_sqlite(env, "step", db, rc);
  return undefined(env);
}

static napi_value js_prepare(napi_env env, napi_callback_info info) {
  napi_value argv[1], this_value;
  if (!get_args(env, info, 1, argv, &this_value)) return NULL;
  Database *database = get_open_database(env, this_value);
  if (database == NULL) return NULL;
  size_t size;
  char *sql =
      get_utf8(env, argv[0], "The SQL must be a string.", "prepare", &size);
  if (sql == NULL) return NULL;
  int lone = has_lone_surrogate(env, argv[0], "prepare");
  if (lone != 0) {
    sqlite3_free(sql);
    return lone < 0 ? NULL
                    : throw_own(env, "prepare",
                                EVOLU_DATABASE_ERROR_INVALID_SQL_TEXT,
                                SQLITE_MISUSE,
                                "The SQL contains a lone surrogate.");
  }
  sqlite3_stmt *stmt;
  evolu_database_error record;
  int rc =
      evolu_database_prepare(database->database, sql, size, &stmt, &record);
  sqlite3_free(sql);
  if (rc != SQLITE_OK) return throw_record(env, "prepare", &record);
  Statement *statement = calloc(1, sizeof *statement);
  if (statement == NULL) {
    sqlite3_finalize(stmt);
    return throw_nomem(env, "prepare");
  }
  statement->stmt = stmt;
  statement->database = database;
  statement->closes = database->closes;
  statement->parameter_count = sqlite3_bind_parameter_count(stmt);
  statement->column_count = -1;
  database->references++;
  napi_value handle = create_handle(
      env, database->environment, database->environment->statement_class,
      &statement_tag, statement, collect_statement);
  if (handle == NULL) {
    sqlite3_finalize(stmt);
    release_database(database);
    free(statement);
  }
  return handle;
}

static napi_value js_export(napi_env env, napi_callback_info info) {
  napi_value this_value;
  if (!get_args(env, info, 0, NULL, &this_value)) return NULL;
  Database *database = get_open_database(env, this_value);
  if (database == NULL) return NULL;
  uint8_t *bytes;
  size_t size;
  evolu_database_error record;
  if (evolu_database_export(database->database, &bytes, &size, &record) !=
      SQLITE_OK)
    return throw_record(env, "export", &record);
  napi_value buffer;
  if (napi_create_external_arraybuffer(env, bytes, size, free_export,
                                       (void *)(uintptr_t)size,
                                       &buffer) != napi_ok) {
    evolu_database_free_export(bytes, size);
    return fail(env);
  }
  int64_t adjusted;
  if (napi_adjust_external_memory(env, (int64_t)size, &adjusted) != napi_ok)
    return fail(env);
  return buffer;
}

// Never throws for an error SQLite reports: a connection SQLite can't close
// stays open, holding its file, and a later close tries again.
static napi_value js_close(napi_env env, napi_callback_info info) {
  napi_value this_value;
  if (!get_args(env, info, 0, NULL, &this_value)) return NULL;
  Database *database =
      get_this(env, this_value, &database_tag, "Expected a database.");
  if (database == NULL) return NULL;
  if (database->database != NULL) close_database(database);
  return undefined(env);
}

static napi_value js_open_memory(napi_env env, napi_callback_info info) {
  (void)info;
  evolu_database *opened;
  evolu_database_error record;
  if (evolu_database_open_memory(&opened, &record) != SQLITE_OK)
    return throw_record(env, "open", &record);
  return create_database(env, opened);
}

static napi_value js_open_file(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv, NULL)) return NULL;
  size_t size;
  char *path =
      get_utf8(env, argv[0], "The path must be a string.", "open", &size);
  if (path == NULL) return NULL;
  evolu_database *opened;
  evolu_database_error record;
  int rc = evolu_database_open_file(path, size, &opened, &record);
  sqlite3_free(path);
  if (rc != SQLITE_OK) return throw_record(env, "open", &record);
  return create_database(env, opened);
}

// The path converts first, then the key is copied, which no call runs
// JavaScript between, and the copy is wiped once the codec has its own.
static napi_value js_open_encrypted_file(napi_env env,
                                         napi_callback_info info) {
  napi_value argv[2];
  if (!get_args(env, info, 2, argv, NULL)) return NULL;
  size_t size;
  char *path =
      get_utf8(env, argv[0], "The path must be a string.", "open", &size);
  if (path == NULL) return NULL;
  uint8_t *key_bytes;
  if (!get_exact_bytes(env, argv[1], EVOLU_DATABASE_KEY_SIZE,
                       "The key must be a Uint8Array of 32 bytes.",
                       &key_bytes)) {
    sqlite3_free(path);
    return NULL;
  }
  uint8_t key[EVOLU_DATABASE_KEY_SIZE];
  memcpy(key, key_bytes, sizeof key);
  evolu_database *opened;
  evolu_database_error record;
  int rc =
      evolu_database_open_encrypted_file(path, size, key, &opened, &record);
  evolu_database_wipe(key, sizeof key);
  sqlite3_free(path);
  if (rc != SQLITE_OK) return throw_record(env, "open", &record);
  return create_database(env, opened);
}

static napi_value js_is_file_open(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv, NULL)) return NULL;
  size_t size;
  char *path = get_utf8(env, argv[0], "The path must be a string.",
                        "isFileOpen", &size);
  if (path == NULL) return NULL;
  int is_open;
  evolu_database_error record;
  int rc = evolu_database_is_file_open(path, size, &is_open, &record);
  sqlite3_free(path);
  if (rc != SQLITE_OK) return throw_record(env, "isFileOpen", &record);
  napi_value result;
  if (napi_get_boolean(env, is_open, &result) != napi_ok) return fail(env);
  return result;
}

static napi_value js_delete_file(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv, NULL)) return NULL;
  size_t size;
  char *path = get_utf8(env, argv[0], "The path must be a string.",
                        "deleteFile", &size);
  if (path == NULL) return NULL;
  evolu_database_error record;
  int rc = evolu_database_delete_file(path, size, &record);
  sqlite3_free(path);
  if (rc != SQLITE_OK) return throw_record(env, "deleteFile", &record);
  return undefined(env);
}

static napi_value js_fill_random(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  if (!get_args(env, info, 1, argv, NULL)) return NULL;
  uint8_t *data = NULL;
  size_t size = 0;
  int is_bytes = get_bytes(env, argv[0], &data, &size);
  if (is_bytes < 0) return NULL;
  if (!is_bytes)
    return throw_type_error(env, "The bytes must be a Uint8Array.");
  if (size > 0 && evolu_database_random_bytes(data, size) != SQLITE_OK)
    return throw_plain_error(env, "The platform's random source failed.");
  return undefined(env);
}

// Reads the key, the nonce and the input of an XChaCha20-Poly1305 call, or
// returns false with a TypeError or another exception pending.
static bool get_xchacha_arguments(napi_env env, napi_value *argv,
                                  uint8_t **key, uint8_t **nonce,
                                  uint8_t **input, size_t *input_size) {
  if (!get_exact_bytes(env, argv[0], EVOLU_XCHACHA_KEY_SIZE,
                       "The key must be a Uint8Array of 32 bytes.", key) ||
      !get_exact_bytes(env, argv[1], EVOLU_XCHACHA_NONCE_SIZE,
                       "The nonce must be a Uint8Array of 24 bytes.", nonce))
    return false;
  int is_bytes = get_bytes(env, argv[2], input, input_size);
  if (is_bytes < 0) return false;
  if (!is_bytes) throw_type_error(env, "The input must be a Uint8Array.");
  return is_bytes;
}

// Creates a Uint8Array of size bytes with a buffer of its own, or returns NULL
// with an exception pending.
static napi_value create_output(napi_env env, size_t size, uint8_t **data) {
  napi_value buffer, output;
  void *bytes;
  if (napi_create_arraybuffer(env, size, &bytes, &buffer) != napi_ok ||
      napi_create_typedarray(env, napi_uint8_array, size, buffer, 0,
                             &output) != napi_ok)
    return fail(env);
  *data = bytes;
  return output;
}

// The output first, then the arguments' data, which no call moves before C
// reads it.
static napi_value js_encrypt_xchacha(napi_env env, napi_callback_info info) {
  napi_value argv[3];
  if (!get_args(env, info, 3, argv, NULL)) return NULL;
  uint8_t *key, *nonce, *plaintext, *output_bytes;
  size_t size;
  if (!get_xchacha_arguments(env, argv, &key, &nonce, &plaintext, &size))
    return NULL;
  napi_value output =
      create_output(env, size + EVOLU_XCHACHA_TAG_SIZE, &output_bytes);
  if (output == NULL ||
      !get_xchacha_arguments(env, argv, &key, &nonce, &plaintext, &size))
    return NULL;
  evolu_xchacha_encrypt(output_bytes, key, nonce, plaintext, size);
  return output;
}

static napi_value js_decrypt_xchacha(napi_env env, napi_callback_info info) {
  napi_value argv[3];
  if (!get_args(env, info, 3, argv, NULL)) return NULL;
  uint8_t *key, *nonce, *ciphertext, *output_bytes;
  size_t size;
  if (!get_xchacha_arguments(env, argv, &key, &nonce, &ciphertext, &size))
    return NULL;
  if (size < EVOLU_XCHACHA_TAG_SIZE)
    return throw_plain_error(env, "The ciphertext doesn't authenticate.");
  napi_value output =
      create_output(env, size - EVOLU_XCHACHA_TAG_SIZE, &output_bytes);
  if (output == NULL ||
      !get_xchacha_arguments(env, argv, &key, &nonce, &ciphertext, &size))
    return NULL;
  if (evolu_xchacha_decrypt(output_bytes, key, nonce, ciphertext, size) !=
      EVOLU_XCHACHA_OK)
    return throw_plain_error(env, "The ciphertext doesn't authenticate.");
  return output;
}

// A class's constructor, which only C calls.
static napi_value construct(napi_env env, napi_callback_info info) {
  napi_value this_value;
  if (!get_args(env, info, 0, NULL, &this_value)) return NULL;
  Environment *environment = get_environment(env);
  if (environment == NULL || !environment->is_constructing)
    return throw_type_error(env, "Illegal constructor.");
  return this_value;
}

// Creates the environment's state on its first createBinding, or returns NULL
// with an exception pending.
static Environment *create_environment(napi_env env) {
  Environment *environment = calloc(1, sizeof *environment);
  if (environment == NULL) return throw_nomem(env, "open");
  napi_property_descriptor database_methods[] = {
      {"prepare", NULL, js_prepare, NULL, NULL, NULL, napi_default_method,
       NULL},
      {"export", NULL, js_export, NULL, NULL, NULL, napi_default_method, NULL},
      {"close", NULL, js_close, NULL, NULL, NULL, napi_default_method, NULL},
  };
  napi_property_descriptor statement_methods[] = {
      {"run", NULL, js_run, NULL, NULL, NULL, napi_default_method, NULL},
      {"bind", NULL, js_bind, NULL, NULL, NULL, napi_default_method, NULL},
      {"step", NULL, js_step, NULL, NULL, NULL, napi_default_method, NULL},
      {"reset", NULL, js_reset, NULL, NULL, NULL, napi_default_method, NULL},
      {"finalize", NULL, js_finalize, NULL, NULL, NULL, napi_default_method,
       NULL},
  };
  // The methods go on the prototypes as plain functions, since a class's own
  // methods would let V8 refuse another kind of `this` with its own message.
  napi_value database_class, database_prototype, statement_class,
      statement_prototype, global, object, object_create;
  if (napi_define_class(env, "NativeSqliteDatabase", NAPI_AUTO_LENGTH,
                        construct, NULL, 0, NULL,
                        &database_class) != napi_ok ||
      napi_get_named_property(env, database_class, "prototype",
                              &database_prototype) != napi_ok ||
      napi_define_properties(
          env, database_prototype,
          sizeof database_methods / sizeof database_methods[0],
          database_methods) != napi_ok ||
      napi_define_class(env, "NativeSqliteStatement", NAPI_AUTO_LENGTH,
                        construct, NULL, 0, NULL,
                        &statement_class) != napi_ok ||
      napi_get_named_property(env, statement_class, "prototype",
                              &statement_prototype) != napi_ok ||
      napi_define_properties(
          env, statement_prototype,
          sizeof statement_methods / sizeof statement_methods[0],
          statement_methods) != napi_ok ||
      napi_get_global(env, &global) != napi_ok ||
      napi_get_named_property(env, global, "Object", &object) != napi_ok ||
      napi_get_named_property(env, object, "create", &object_create) !=
          napi_ok ||
      napi_create_reference(env, database_class, 1,
                            &environment->database_class) != napi_ok ||
      napi_create_reference(env, statement_class, 1,
                            &environment->statement_class) != napi_ok ||
      napi_create_reference(env, object_create, 1,
                            &environment->object_create) != napi_ok ||
      napi_set_instance_data(env, environment, finalize_environment, NULL) !=
          napi_ok) {
    fail(env);
    if (environment->database_class != NULL)
      napi_delete_reference(env, environment->database_class);
    if (environment->statement_class != NULL)
      napi_delete_reference(env, environment->statement_class);
    if (environment->object_create != NULL)
      napi_delete_reference(env, environment->object_create);
    free(environment);
    return NULL;
  }
  return environment;
}

// node/addon.c's createBinding: checks the build and returns a binding object
// for the environment.
napi_value evolu_node_create_binding(napi_env env, napi_callback_info info) {
  (void)info;
  evolu_database_error record;
  if (evolu_database_check_build(&record) != SQLITE_OK) {
    throw_plain_error(env, record.message);
    evolu_database_clear_error(&record);
    return NULL;
  }
  bool pending = false;
  Environment *environment = get_environment(env);
  if (environment == NULL &&
      (napi_is_exception_pending(env, &pending) != napi_ok || pending ||
       create_environment(env) == NULL))
    return NULL;
  napi_value binding, abi_version;
  if (napi_create_object(env, &binding) != napi_ok ||
      napi_create_int32(env, ABI_VERSION, &abi_version) != napi_ok)
    return fail(env);
  napi_property_descriptor properties[] = {
      {"abiVersion", NULL, NULL, NULL, NULL, abi_version, napi_enumerable,
       NULL},
      {"openMemory", NULL, js_open_memory, NULL, NULL, NULL, napi_enumerable,
       NULL},
      {"openFile", NULL, js_open_file, NULL, NULL, NULL, napi_enumerable, NULL},
      {"openEncryptedFile", NULL, js_open_encrypted_file, NULL, NULL, NULL,
       napi_enumerable, NULL},
      {"isFileOpen", NULL, js_is_file_open, NULL, NULL, NULL, napi_enumerable,
       NULL},
      {"deleteFile", NULL, js_delete_file, NULL, NULL, NULL, napi_enumerable,
       NULL},
      {"fillRandom", NULL, js_fill_random, NULL, NULL, NULL, napi_enumerable,
       NULL},
      {"encryptXChaCha20Poly1305", NULL, js_encrypt_xchacha, NULL, NULL, NULL,
       napi_enumerable, NULL},
      {"decryptXChaCha20Poly1305", NULL, js_decrypt_xchacha, NULL, NULL, NULL,
       napi_enumerable, NULL},
  };
  if (napi_define_properties(env, binding,
                             sizeof properties / sizeof properties[0],
                             properties) != napi_ok)
    return fail(env);
  return binding;
}
