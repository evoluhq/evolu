/*
 * The N-API mirror of React Native's SQLite binding: the JavaScript interface
 * that @evolu/common's NativeSqlite.ts types and describes, which React
 * Native's JSI adapter implements under Hermes, here over Node-API and the same
 * binding layer, binding/evolu_database.h, whose public headers are all it
 * includes. So the TypeScript driver runs in Node.js against the real C, and
 * the Node.js binding starts from it. node/addon.c exports it as
 * createBinding, and @evolu/react-native's test/bindingConformance.ts pins
 * that both adapters behave alike. What is particular to Node-API:
 *
 * - createBinding checks the build and returns a binding object whose
 *   functions keep no state of their own. It takes the row builder of
 *   @evolu/nodejs's NativeSqliteRows.ts, which its environment's first call
 *   keeps references to and connects to the natives its runs call. A connect
 *   that throws leaves the environment to the next createBinding.
 * - Databases and statements are instances of two classes whose prototypes
 *   hold the methods, each with a type tag and its C struct wrapped, so a
 *   method called on another kind of object throws a TypeError. Their
 *   constructors throw when JavaScript calls them. Each handle also has an id,
 *   a number under a symbol, which names its slot in the environment's
 *   handles. The runs, the calls that matter most, are the row builder's: they
 *   pass the id of `this` to a native, since reading a number costs a fraction
 *   of checking a type tag and unwrapping. Object.getOwnPropertySymbols reveals
 *   the symbol, so an object can hold any number under it: the native refuses
 *   an id that names no live handle of its kind, and a slot's generation grows
 *   when its handle is collected, so the id of a collected handle names
 *   nothing, and an id copied from a live handle acts on that handle.
 * - Each Node.js environment that loads the addon, such as a worker thread,
 *   keeps a list of the connections it opened. A collected handle only drops
 *   its reference, so no SQLite call runs from the garbage collector: a
 *   connection whose handle is gone stays open, holding its file, until the
 *   environment's teardown closes every connection it still has, as a JSI
 *   runtime's teardown does.
 * - Strings convert with napi_get_value_string_utf8, which replaces a lone
 *   surrogate with U+FFFD, as text binds it; prepare refuses SQL with one
 *   first, and a database's run when the row builder's String isWellFormed
 *   says it has one.
 * - Reading a parameter can run JavaScript, such as a getter, which could
 *   finalize the statement or close its database. So a run or a bind reads
 *   every parameter before it binds one and checks the statement again,
 *   throwing that it's finalized before SQLite could use it, and a database's
 *   run reads them before it prepares its statement and checks the database,
 *   refusing more than SQLite's limit of a statement's parameters without
 *   reading one.
 *   At its first row, a run or step calls the row builder for the keys of its
 *   column names, which can call a function JavaScript replaced before
 *   NativeSqliteRows.ts loaded, so it checks the statement again after that.
 *   Appending a row to a run's rows is an ordinary set, which can run a setter
 *   of Array.prototype, so a run appends them after it resets the statement,
 *   then checks it again and resets it again. A database's run finalizes its
 *   statement before it appends any row.
 * - Rows are built in JavaScript, by the row builder, since V8 builds an object
 *   faster than Node-API creates one and sets its properties one call at a
 *   time. C passes the first 1,024 values of a call's rows to a function of it
 *   as Node-API values, and collects the others while it steps, which it passes
 *   with all of their numbers and kinds in an ArrayBuffer that the environment
 *   keeps for its next call, and the function builds the rows, with the
 *   builder's row prototype and the keys of the column names the statement
 *   caches, which the environment keeps for its last few lists of names, as
 *   NativeSqliteRows.ts describes. Its builtins are those it took when it
 *   loaded, so a function replaced before then runs while it builds rows, which
 *   is trusted, so the values are its to keep, and C stays memory-safe whatever
 *   it does, though one that runs the binding again then can make the rows
 *   wrong; a prototype's accessor runs neither before nor after. Of the values
 *   after the first 1,024, texts of 13 bytes or more, and shorter ones that
 *   aren't well-formed UTF-8, become Node-API strings, which a few calls pass
 *   in chunks, but those of 76 bytes or more that aren't ASCII decode in
 *   JavaScript, whichever creates them faster, and blobs of 64 bytes or more
 *   get buffers of their own, which the chunks pass too, so a large result's
 *   blobs aren't held twice. A run or step whose values are a few numbers or
 *   NULLs, and at most one text or blob, calls no JavaScript: it writes them to
 *   memory the environment shares with the row builder, and the text or blob to
 *   an element of an array the builder has, and the builder's run or step
 *   builds their rows after the native returns, and a run appends them and
 *   settles the statement, as the native does after appending, when a setter
 *   could have changed it. C reads where that memory is again after it let
 *   JavaScript run, and throws once it's detached, which a row builder other
 *   than NativeSqliteRows.ts can do.
 * - An export is an external ArrayBuffer whose finalizer wipes and frees it,
 *   with its size reported as external memory.
 */
#include <node_api.h>

#include "evolu_database.h"
#include "evolu_xchacha.h"

#include <math.h>
#include <stdbool.h>
#include <stdlib.h>
#include <stddef.h>
#include <string.h>

// The version of the interface NativeSqlite.ts types, which a loader checks.
#define ABI_VERSION 2

// The largest integer a JS number holds exactly, Number.MAX_SAFE_INTEGER.
#define MAX_SAFE_INTEGER 9007199254740991.0

// The largest text or blob, in bytes, of UTF-8 for text, whose copy a
// statement keeps after a run. @evolu/sqlite-wasm uses the same 64 KiB but
// counts 3 bytes per UTF-16 code unit of text, so it also clears some shorter
// texts.
#define MAX_KEPT_VALUE 65536

typedef struct Database Database;

// How many lists of column names an environment keeps the keys of for
// databases' runs, whose statements keep none, and the bytes of a list it
// keeps.
#define RUN_NAMES 8
#define RUN_NAMES_SIZE 512

// A list of column names, each with its NUL, and the keys of the names.
typedef struct {
  char names[RUN_NAMES_SIZE];
  size_t size;
  napi_ref keys; // NULL while the slot is empty.
} RunNames;

// A slot's last generation, below 2^21, so an id stays an integer that a
// double holds exactly, which the test addon lowers.
#ifndef EVOLU_NODE_LAST_GENERATION
#define EVOLU_NODE_LAST_GENERATION 0x1fffff
#endif
_Static_assert(EVOLU_NODE_LAST_GENERATION < 0x200000,
               "An id must stay an integer that a double holds exactly.");

// The most slots an environment's handles take, which the test addon can
// lower. UINT32_MAX marks that no slot is free, so no slot is numbered so.
#ifndef EVOLU_NODE_SLOTS
#define EVOLU_NODE_SLOTS UINT32_MAX
#endif

// The kinds of handle an id names.
enum { HANDLE_FREE, HANDLE_DATABASE, HANDLE_STATEMENT };

// A slot of the environment's handles: the struct of a live handle and its
// kind, or the next free slot. Its generation grows each time it's freed, so
// the id of a collected handle names nothing.
typedef struct {
  void *data;
  uint32_t generation;
  uint8_t kind;
  uint32_t next_free;
} Handle;

// The arrays a call's values grow, with their capacities, which an environment
// keeps for its next call, so the call of a large result allocates none.
typedef struct {
  uint8_t *kinds;
  double *numbers;
  size_t capacity;
  unsigned char *text;
  size_t text_capacity;
  unsigned char *bytes;
  size_t bytes_capacity;
  napi_value *texts;
  size_t texts_capacity;
} ValueArrays;

// What an environment keeps: the connections it opened, the classes of the
// handles and their ids, the row builder of its first createBinding, and the
// memory it shares with it. Its handles keep it, so a handle collected after
// its teardown still frees its slot.
typedef struct {
  Database *databases;
  napi_ref database_class;
  napi_ref statement_class;
  napi_ref holder;
  napi_ref objects;
  napi_ref take;
  napi_ref create_rows;
  napi_ref create_row;
  napi_ref take_texts;
  // The keys of a handle's id, symbols the row builder reads it with.
  napi_ref database_key;
  napi_ref statement_key;
  Handle *handles;
  uint32_t handle_count;
  size_t handle_capacity;
  uint32_t free_handle; // UINT32_MAX when no slot is free.
  napi_ref shared; // SHARED_* below.
  // The buffer of a call of more than ARGUMENT_VALUES values, which the next
  // reuses, or NULL before the first.
  napi_ref buffer;
  // None while a call has them, so a call that one runs grows arrays of its
  // own.
  ValueArrays arrays;
  // How many times C let JavaScript run, which could have detached the shared
  // memory if the row builder isn't NativeSqliteRows.ts.
  uint64_t javascript_calls;
  // The last lists of the column names of databases' runs, the next to
  // replace at next_run_names.
  RunNames run_names[RUN_NAMES];
  size_t next_run_names;
  // Its live handles, and its teardown until it runs.
  size_t references;
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
  uint32_t slot;
};

typedef struct {
  // NULL once finalized, and finalized by the close of its database.
  sqlite3_stmt *stmt;
  Database *database;
  uint32_t slot;
  // Its database's closes when it was prepared; a later close finalized it.
  int closes;
  int parameter_count;
  // Whether the last step returned a row.
  bool has_row;
  // The keys of the column names, an array-like object with the builder's row
  // prototype, read for the preparation that reprepares counts, or NULL before
  // they're read.
  napi_ref names;
  int reprepares;
} Statement;

// Random values that mark the handles of this binding by kind, in the type
// tags handle_tag returns.
static const uint64_t database_tag = 0xa47e2c19d03b86f5ULL;
static const uint64_t statement_tag = 0x6c0e8d4a2f71b93eULL;

// Returns NULL, throwing an Error for the Node-API call that just failed
// unless it left an exception pending.
static void *fail(napi_env env) {
  const napi_extended_error_info *info = NULL;
  const char *message = "Node-API call failed";
  // Read before any other call, which would replace it.
  if (napi_get_last_error_info(env, &info) == napi_ok &&
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

// Creates NativeSqlite.ts's NativeSqliteCodecFailure, or null for none.
static bool create_codec_failure(napi_env env,
                                 const evolu_database_codec_failure *failure,
                                 napi_value *result) {
  const char *type;
  switch (failure->type) {
  case EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION:
    type = "SqlitePageAuthenticationError";
    break;
  case EVOLU_DATABASE_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED:
    type = "SqliteEncryptionUnsupported";
    break;
  case EVOLU_DATABASE_CODEC_FAILURE_RANDOM:
    type = "SqliteRandomSourceError";
    break;
  default: // EVOLU_DATABASE_CODEC_FAILURE_NONE, as the JSI adapter maps it.
    return napi_get_null(env, result) == napi_ok;
  }
  napi_value error, page_number;
  if (!create_typed(env, type, &error)) return false;
  if (failure->type == EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION &&
      (napi_create_uint32(env, failure->page_number, &page_number) !=
           napi_ok ||
       !define(env, error, "pageNumber", page_number)))
    return false;
  return create_typed(env, "SqliteCodecFailure", result) &&
         define(env, *result, "error", error);
}

// Creates NativeSqlite.ts's NativeSqliteError of a record from SQLite.
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

// Creates the error a record describes, as NativeSqlite.ts describes it: a
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
  default: // EVOLU_DATABASE_ERROR_SQLITE, since a record of none never throws.
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

// Returns the type tag of a kind of handle: its random value, with the address
// of a static, which differs in each copy of the addon a process loads, so
// one never takes another's handle, which Node.js tags with the same private
// key, for its own.
static napi_type_tag handle_tag(uint64_t random) {
  static const char copy = 0;
  return (napi_type_tag){(uint64_t)(uintptr_t)&copy, random};
}

// Returns the struct of the handle `this` is, or NULL with a TypeError naming
// what was expected.
static void *get_this(napi_env env, napi_value this_value, uint64_t random,
                      const char *expected) {
  napi_valuetype type;
  if (napi_typeof(env, this_value, &type) != napi_ok) return fail(env);
  bool is_tagged = false;
  napi_type_tag tag = handle_tag(random);
  if (type == napi_object &&
      napi_check_object_type_tag(env, this_value, &tag, &is_tagged) != napi_ok)
    return fail(env);
  if (!is_tagged) return throw_type_error(env, expected);
  void *data;
  if (napi_unwrap(env, this_value, &data) != napi_ok) return fail(env);
  return data;
}

static Database *get_open_database(napi_env env, napi_value this_value) {
  Database *database =
      get_this(env, this_value, database_tag, "Expected a database.");
  if (database == NULL || database->database != NULL) return database;
  return throw_plain_error(env, "The database is closed.");
}

static bool is_live(const Statement *statement) {
  return statement->stmt != NULL && statement->database->database != NULL &&
         statement->closes == statement->database->closes;
}

static Statement *get_live_statement(napi_env env, napi_value this_value) {
  Statement *statement =
      get_this(env, this_value, statement_tag, "Expected a statement.");
  if (statement == NULL || is_live(statement)) return statement;
  return throw_plain_error(env, "The statement is finalized.");
}

// Grows an array of items of size from *capacity to hold needed, doubling,
// or returns false.
static bool reserve(void **items, size_t *capacity, size_t needed,
                    size_t size) {
  if (needed <= *capacity) return true;
  size_t grown = *capacity > 0 ? *capacity : 64;
  while (grown < needed) grown *= 2;
  void *grown_items = realloc(*items, grown * size);
  if (grown_items == NULL) return false;
  *items = grown_items;
  *capacity = grown;
  return true;
}

// Drops a reference to an environment, freeing it after the last.
static void release_environment(Environment *environment) {
  if (--environment->references > 0) return;
  free(environment->arrays.kinds);
  free(environment->arrays.numbers);
  free(environment->arrays.text);
  free(environment->arrays.bytes);
  free(environment->arrays.texts);
  free(environment->handles);
  free(environment);
}

// The id of the handle in a slot, which JavaScript holds as a number.
static double handle_id(const Environment *environment, uint32_t slot) {
  return (double)environment->handles[slot].generation * 4294967296.0 + slot;
}

// Takes a free slot for a handle's struct, which keeps the environment, or
// returns false.
static bool take_handle(Environment *environment, uint8_t kind, void *data,
                        uint32_t *slot) {
  if (environment->free_handle == UINT32_MAX) {
    if (environment->handle_count == EVOLU_NODE_SLOTS ||
        !reserve((void **)&environment->handles,
                 &environment->handle_capacity,
                 (size_t)environment->handle_count + 1,
                 sizeof *environment->handles))
      return false;
    environment->handles[environment->handle_count] =
        (Handle){.next_free = UINT32_MAX};
    environment->free_handle = environment->handle_count++;
  }
  *slot = environment->free_handle;
  Handle *handle = &environment->handles[*slot];
  environment->free_handle = handle->next_free;
  handle->data = data;
  handle->kind = kind;
  environment->references++;
  return true;
}

// Frees the slot of a collected handle, and its reference to the
// environment. A slot at its last generation retires, so no id a collected
// handle had ever names another.
static void free_handle(Environment *environment, uint32_t slot) {
  Handle *handle = &environment->handles[slot];
  handle->data = NULL;
  handle->kind = HANDLE_FREE;
  if (handle->generation < EVOLU_NODE_LAST_GENERATION) {
    handle->generation++;
    handle->next_free = environment->free_handle;
    environment->free_handle = slot;
  }
  release_environment(environment);
}

// Returns the struct of the live handle of a kind that an id names, or NULL
// with a TypeError naming what was expected.
static void *get_handle(napi_env env, const Environment *environment,
                        napi_value id, uint8_t kind, const char *expected) {
  double number;
  napi_status status = napi_get_value_double(env, id, &number);
  if (status != napi_ok && status != napi_number_expected) return fail(env);
  if (status == napi_ok && number >= 0 && number < 9007199254740992.0 &&
      floor(number) == number) {
    uint64_t value = (uint64_t)number;
    uint32_t slot = (uint32_t)value;
    if (slot < environment->handle_count &&
        environment->handles[slot].kind == kind &&
        environment->handles[slot].generation == (uint32_t)(value >> 32))
      return environment->handles[slot].data;
  }
  return throw_type_error(env, expected);
}

static Database *get_open_database_by_id(napi_env env,
                                         const Environment *environment,
                                         napi_value id) {
  Database *database = get_handle(env, environment, id, HANDLE_DATABASE,
                                  "Expected a database.");
  if (database == NULL || database->database != NULL) return database;
  return throw_plain_error(env, "The database is closed.");
}

static Statement *get_live_statement_by_id(napi_env env,
                                           const Environment *environment,
                                           napi_value id) {
  Statement *statement = get_handle(env, environment, id, HANDLE_STATEMENT,
                                    "Expected a statement.");
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

static void free_column_names(napi_env env, Statement *statement) {
  if (statement->names != NULL) napi_delete_reference(env, statement->names);
  statement->names = NULL;
}

static void collect_database(napi_env env, void *data, void *hint) {
  (void)env;
  (void)hint;
  Database *database = data;
  free_handle(database->environment, database->slot);
  release_database(database);
}

// A collected statement only drops its reference; its database's close
// finalizes it.
static void collect_statement(napi_env env, void *data, void *hint) {
  (void)hint;
  Statement *statement = data;
  free_column_names(env, statement);
  free_handle(statement->database->environment, statement->slot);
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
  napi_delete_reference(env, environment->holder);
  napi_delete_reference(env, environment->objects);
  napi_delete_reference(env, environment->take);
  napi_delete_reference(env, environment->create_rows);
  napi_delete_reference(env, environment->create_row);
  napi_delete_reference(env, environment->take_texts);
  napi_delete_reference(env, environment->database_key);
  napi_delete_reference(env, environment->statement_key);
  napi_delete_reference(env, environment->shared);
  if (environment->buffer != NULL)
    napi_delete_reference(env, environment->buffer);
  for (size_t i = 0; i < RUN_NAMES; i++)
    if (environment->run_names[i].keys != NULL)
      napi_delete_reference(env, environment->run_names[i].keys);
  release_environment(environment);
}

// Creates a handle of a kind with the id of a slot it takes, unenumerable,
// unwritable and unconfigurable, then tags it and wraps data in it, or
// returns NULL with an exception pending and data not wrapped.
static napi_value create_handle(napi_env env, Environment *environment,
                                uint8_t kind, void *data, uint32_t *slot,
                                napi_finalize collect) {
  bool is_database = kind == HANDLE_DATABASE;
  if (!take_handle(environment, kind, data, slot))
    return throw_nomem(env, is_database ? "open" : "prepare");
  napi_value constructor, handle, key, id;
  bool ok = napi_get_reference_value(env,
                                     is_database ? environment->database_class
                                                 : environment->statement_class,
                                     &constructor) == napi_ok;
  if (ok) {
    environment->is_constructing = true;
    ok = napi_new_instance(env, constructor, 0, NULL, &handle) == napi_ok;
    environment->is_constructing = false;
  }
  napi_property_descriptor descriptor = {NULL, NULL, NULL, NULL,
                                         NULL, NULL, napi_default, NULL};
  napi_type_tag tag = handle_tag(is_database ? database_tag : statement_tag);
  ok = ok &&
       napi_get_reference_value(env,
                                is_database ? environment->database_key
                                            : environment->statement_key,
                                &key) == napi_ok &&
       napi_create_double(env, handle_id(environment, *slot), &id) == napi_ok;
  if (ok) {
    descriptor.name = key;
    descriptor.value = id;
    ok = napi_define_properties(env, handle, 1, &descriptor) == napi_ok &&
         napi_type_tag_object(env, handle, &tag) == napi_ok &&
         napi_wrap(env, handle, data, collect, NULL, NULL) == napi_ok;
  }
  if (ok) return handle;
  fail(env);
  free_handle(environment, *slot);
  return NULL;
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
  napi_value handle = create_handle(env, environment, HANDLE_DATABASE, database,
                                    &database->slot, collect_database);
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

// Calls a function of the environment's row builder, or returns NULL with an
// exception pending.
static napi_value call(napi_env env, Environment *environment,
                       napi_ref function, size_t argc, const napi_value *argv) {
  environment->javascript_calls++;
  napi_value callee, receiver, result;
  if (napi_get_reference_value(env, function, &callee) != napi_ok ||
      napi_get_undefined(env, &receiver) != napi_ok ||
      napi_call_function(env, receiver, callee, argc, argv, &result) !=
          napi_ok)
    return fail(env);
  return result;
}

// The object the environment's functions read a call's values from next, or
// NULL with an exception pending.
static napi_value get_values(napi_env env, Environment *environment) {
  napi_value holder, values;
  if (napi_get_reference_value(env, environment->holder, &holder) != napi_ok ||
      napi_get_element(env, holder, 0, &values) != napi_ok)
    return fail(env);
  return values;
}

// How many values a call passes to the row builder as Node-API values, so a
// result of up to as many, such as a point select's, needs no buffer. A larger
// one passes the values after them in one ArrayBuffer, which costs more per
// value, so as many as cost the stacks a fraction: 8 KiB of V8's for the
// arguments, and of C's about 18 KiB in a native's frame, also while SQLite
// prepares and steps, and 29 KB in the deepest chain, a database run calling
// the row builder, 15% of the 192 KiB that Node.js leaves below V8's stack
// limit in a Worker, which SQLite's own recursion also uses.
#define ARGUMENT_VALUES 1024

// The memory an environment shares with its row builder, as doubles: a run's
// count of values, when they're there, its changes, and a count of the calls
// that stepped, reset, bound or finalized a statement or closed a database;
// then ARGUMENT_VALUES numbers, and their kinds as bytes. A run whose values
// are as many numbers or NULLs at most writes them there, so it calls no
// JavaScript, and every other run sets the count to 0. The row builder
// appends their rows after the run returns, so it checks the statement again
// when the count of calls changed.
#define SHARED_COUNT 0
#define SHARED_CHANGES 1
#define SHARED_CALLS 2
#define SHARED_NUMBERS 3
#define SHARED_SIZE                                                            \
  (sizeof(double) * (SHARED_NUMBERS + ARGUMENT_VALUES) + ARGUMENT_VALUES)

// The kinds of value, as NativeSqliteRows.ts reads them.
enum {
  VALUE_NULL,
  VALUE_NUMBER,
  // Well-formed UTF-8 shorter than SHORT_TEXT bytes, so the texts decode
  // together.
  VALUE_SHORT_TEXT,
  // Any other text that's ASCII or of fewer than DECODED_TEXT bytes, or a blob
  // of OWN_BLOB bytes or more, a Node-API value, which a call passes to the row
  // builder's takeTexts, TEXT_CHUNK at a time: V8 creates a text as a copy, and
  // one call with many arguments costs less per value than the row builder
  // decoding or copying each, while the value keeps only its own memory.
  VALUE_TEXT,
  VALUE_BLOB,
  // Any other text, whose bytes the row builder decodes on its own, since its
  // decoder reads that much UTF-8 that isn't ASCII faster than V8 creates a
  // string of it.
  VALUE_ENCODED_TEXT,
  // A text or blob of the first values of a call of more, which passes it
  // after the buffer, after the ones before it.
  VALUE_OBJECT,
};

#define TEXT_CHUNK 256

// The fewest bytes of a text that isn't ASCII which the row builder decodes:
// its decoder costs more a text than V8 creating a string, but less a byte,
// and they cross between 72 and 76 bytes, so a shorter one is a Node-API
// string, as a longer ASCII text is.
#define DECODED_TEXT 76

// The fewest bytes of a blob after the first values that C creates with a
// buffer of its own, as it creates the first values' blobs, so a large
// result's blobs aren't held twice, in C's array and in the call's buffer,
// before the row builder copies each, while a shorter one's copies cost less
// than the Node-API calls.
#define OWN_BLOB 64

// A short text has fewer bytes, so fewer than 13 UTF-16 code units, and V8
// copies a slice that short. A longer slice is a view that keeps the whole
// string it's sliced from, so a row kept from a result would keep the texts of
// every other row.
// https://github.com/v8/v8/blob/main/src/objects/string.h (SlicedString)
#define SHORT_TEXT 13

// The values of a call's rows, row after row: the first ARGUMENT_VALUES as
// Node-API values for texts and blobs and as kinds and numbers otherwise, and
// the others as C collects them for the buffer: a kind and a number each, the
// number for a number, the UTF-16 length for a short text and the byte length
// otherwise; the UTF-8 of short texts; the bytes of shorter blobs and encoded
// texts; and the other texts and blobs as Node-API values. The handles stay
// until the call returns, since a scope per row costs more than the values' own
// memory.
typedef struct {
  // How many first values are texts or blobs, and the index of the last.
  uint32_t object_count;
  uint32_t object_index;
  uint32_t count;
  uint8_t *kinds;
  double *numbers;
  size_t capacity;
  unsigned char *text;
  size_t text_size;
  size_t text_capacity;
  unsigned char *bytes;
  size_t bytes_size;
  size_t bytes_capacity;
  napi_value *texts;
  size_t text_count;
  size_t texts_capacity;
  // Last, since start_values leaves them unset.
  napi_value first[ARGUMENT_VALUES];
  uint8_t first_kinds[ARGUMENT_VALUES];
  double first_numbers[ARGUMENT_VALUES];
} Values;

// Starts values with none, in the arrays the environment keeps. A first value
// is set before it's read, so they stay unset, which saves clearing them for
// every run.
static void start_values(Values *values, Environment *environment) {
  memset(values, 0, offsetof(Values, first));
  ValueArrays *arrays = &environment->arrays;
  values->kinds = arrays->kinds;
  values->numbers = arrays->numbers;
  values->capacity = arrays->capacity;
  values->text = arrays->text;
  values->text_capacity = arrays->text_capacity;
  values->bytes = arrays->bytes;
  values->bytes_capacity = arrays->bytes_capacity;
  values->texts = arrays->texts;
  values->texts_capacity = arrays->texts_capacity;
  *arrays = (ValueArrays){NULL, NULL, 0, NULL, 0, NULL, 0, NULL, 0};
}

// The most values of an array, and bytes of one or of a call's buffer, that
// the environment keeps for the next call, so a large result's call allocates
// none, while a larger one's arrays and buffer are its own.
#define KEPT_VALUES 16384
#define KEPT_BUFFER (256 * 1024)

// Gives the arrays of values back to the environment, unless a call that ran
// meanwhile gave its own back, or frees them, as each one it would keep larger
// than KEPT_VALUES or KEPT_BUFFER.
static void free_values(Values *values, Environment *environment) {
  ValueArrays *arrays = &environment->arrays;
  // A call has numbers only once it has kinds, which grow first.
  bool is_kept = arrays->kinds == NULL && arrays->text == NULL &&
                 arrays->bytes == NULL && arrays->texts == NULL;
  if (is_kept && values->capacity <= KEPT_VALUES) {
    arrays->kinds = values->kinds;
    arrays->numbers = values->numbers;
    arrays->capacity = values->capacity;
  } else {
    free(values->kinds);
    free(values->numbers);
  }
  if (is_kept && values->text_capacity <= KEPT_BUFFER) {
    arrays->text = values->text;
    arrays->text_capacity = values->text_capacity;
  } else {
    free(values->text);
  }
  if (is_kept && values->bytes_capacity <= KEPT_BUFFER) {
    arrays->bytes = values->bytes;
    arrays->bytes_capacity = values->bytes_capacity;
  } else {
    free(values->bytes);
  }
  if (is_kept && values->texts_capacity <= KEPT_VALUES) {
    arrays->texts = values->texts;
    arrays->texts_capacity = values->texts_capacity;
  } else {
    free(values->texts);
  }
}

// Appends size bytes to an area, or returns false.
static bool append_bytes(unsigned char **area, size_t *area_size,
                         size_t *capacity, const void *data, size_t size) {
  if (!reserve((void **)area, capacity, *area_size + size, 1)) return false;
  if (size > 0) memcpy(*area + *area_size, data, size);
  *area_size += size;
  return true;
}

// Appends a value of a kind with its number for the buffer, or returns false.
static bool append_buffered(Values *values, uint8_t kind, double number) {
  size_t index = values->count - ARGUMENT_VALUES;
  if (index == values->capacity) {
    size_t kinds = values->capacity;
    if (!reserve((void **)&values->kinds, &kinds, index + 1, 1) ||
        !reserve((void **)&values->numbers, &values->capacity, index + 1,
                 sizeof *values->numbers))
      return false;
  }
  values->kinds[index] = kind;
  values->numbers[index] = number;
  values->count++;
  return true;
}

// Whether text is ASCII, read eight bytes at a time.
static bool is_ascii(const unsigned char *text, size_t size) {
  size_t i = 0;
  for (; size - i >= 8; i += 8) {
    uint64_t word;
    memcpy(&word, text + i, 8);
    if ((word & 0x8080808080808080ULL) != 0) return false;
  }
  for (; i < size; i++)
    if (text[i] >= 0x80) return false;
  return true;
}

// The UTF-16 length of text when it's well-formed UTF-8, by the well-formed
// sequences of Unicode's table 3-7, and -1 otherwise.
static int64_t utf16_length(const unsigned char *text, size_t size) {
  int64_t units = 0;
  size_t i = 0;
  while (i < size) {
    unsigned char lead = text[i];
    if (lead < 0x80) {
      units++;
      i++;
      continue;
    }
    // The range of the second byte, which rules out overlong forms,
    // surrogates and code points above U+10FFFF.
    unsigned char low = 0x80, high = 0xbf;
    size_t length;
    if (lead >= 0xc2 && lead <= 0xdf) {
      length = 2;
    } else if (lead >= 0xe0 && lead <= 0xef) {
      length = 3;
      if (lead == 0xe0) low = 0xa0;
      if (lead == 0xed) high = 0x9f;
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      length = 4;
      if (lead == 0xf0) low = 0x90;
      if (lead == 0xf4) high = 0x8f;
    } else {
      return -1;
    }
    if (size - i < length || text[i + 1] < low || text[i + 1] > high)
      return -1;
    for (size_t k = 2; k < length; k++)
      if ((text[i + k] & 0xc0) != 0x80) return -1;
    units += length == 4 ? 2 : 1;
    i += length;
  }
  return units;
}

// Appends a value of column i of the row of stmt's last step, one of the
// first while there are fewer than ARGUMENT_VALUES and otherwise for the
// buffer, or returns false with an exception pending.
static bool append_column(napi_env env, Values *values, sqlite3_stmt *stmt,
                          int i) {
  sqlite3 *db = sqlite3_db_handle(stmt);
  bool is_first = values->count < ARGUMENT_VALUES;
  napi_value *value = is_first ? &values->first[values->count] : NULL;
  if (is_first) *value = NULL;
  napi_status status = napi_ok;
  bool ok = true;
  // The type first, so a NULL pointer is SQLITE_NOMEM, never SQL NULL.
  switch (sqlite3_column_type(stmt, i)) {
  case SQLITE_INTEGER:
  case SQLITE_FLOAT: {
    double number = sqlite3_column_double(stmt, i);
    if (is_first) {
      values->first_kinds[values->count] = VALUE_NUMBER;
      values->first_numbers[values->count] = number;
    } else {
      ok = append_buffered(values, VALUE_NUMBER, number);
    }
    break;
  }
  case SQLITE_TEXT: {
    // The pointer first, then the length of the text it points to.
    const unsigned char *text = sqlite3_column_text(stmt, i);
    if (text == NULL) return throw_sqlite(env, "step", db, SQLITE_NOMEM);
    size_t size = (size_t)sqlite3_column_bytes(stmt, i);
    if (is_first) {
      // V8 creates an ASCII string faster as Latin-1, its copy.
      status = is_ascii(text, size)
                   ? napi_create_string_latin1(env, (const char *)text, size,
                                               value)
                   : napi_create_string_utf8(env, (const char *)text, size,
                                             value);
      values->first_kinds[values->count] = VALUE_TEXT;
      values->first_numbers[values->count] = 0;
      values->object_index = values->count;
      values->object_count++;
      break;
    }
    int64_t units = size < SHORT_TEXT ? utf16_length(text, size) : -1;
    if (units >= 0) {
      ok = append_buffered(values, VALUE_SHORT_TEXT, (double)units) &&
           append_bytes(&values->text, &values->text_size,
                        &values->text_capacity, text, size);
      break;
    }
    bool is_ascii_text = is_ascii(text, size);
    if (!is_ascii_text && size >= DECODED_TEXT) {
      ok = append_buffered(values, VALUE_ENCODED_TEXT, (double)size) &&
           append_bytes(&values->bytes, &values->bytes_size,
                        &values->bytes_capacity, text, size);
      break;
    }
    napi_value string;
    status = is_ascii_text
                 ? napi_create_string_latin1(env, (const char *)text, size,
                                             &string)
                 : napi_create_string_utf8(env, (const char *)text, size,
                                           &string);
    if (status != napi_ok) break;
    ok = append_buffered(values, VALUE_TEXT, 0) &&
         reserve((void **)&values->texts, &values->texts_capacity,
                 values->text_count + 1, sizeof *values->texts);
    if (ok) values->texts[values->text_count++] = string;
    break;
  }
  case SQLITE_BLOB: {
    // The length first: a zeroblob that sqlite3_column_blob fails to expand
    // becomes NULL.
    size_t size = (size_t)sqlite3_column_bytes(stmt, i);
    const void *blob = sqlite3_column_blob(stmt, i);
    if (blob == NULL && size > 0)
      return throw_sqlite(env, "step", db, SQLITE_NOMEM);
    if (is_first) {
      void *data;
      napi_value buffer;
      status = napi_create_arraybuffer(env, size, &data, &buffer);
      if (status == napi_ok) {
        if (size > 0) memcpy(data, blob, size);
        status = napi_create_typedarray(env, napi_uint8_array, size, buffer, 0,
                                        value);
      }
      values->first_kinds[values->count] = VALUE_BLOB;
      values->first_numbers[values->count] = 0;
      values->object_index = values->count;
      values->object_count++;
      break;
    }
    if (size < OWN_BLOB) {
      ok = append_buffered(values, VALUE_BLOB, (double)size) &&
           append_bytes(&values->bytes, &values->bytes_size,
                        &values->bytes_capacity, blob, size);
      break;
    }
    void *data;
    napi_value buffer, array;
    status = napi_create_arraybuffer(env, size, &data, &buffer);
    if (status == napi_ok) {
      memcpy(data, blob, size);
      status = napi_create_typedarray(env, napi_uint8_array, size, buffer, 0,
                                      &array);
    }
    if (status != napi_ok) break;
    ok = append_buffered(values, VALUE_TEXT, 0) &&
         reserve((void **)&values->texts, &values->texts_capacity,
                 values->text_count + 1, sizeof *values->texts);
    if (ok) values->texts[values->text_count++] = array;
    break;
  }
  default:
    if (is_first) {
      values->first_kinds[values->count] = VALUE_NULL;
      values->first_numbers[values->count] = 0;
    } else
      ok = append_buffered(values, VALUE_NULL, 0);
    break;
  }
  if (status != napi_ok) {
    fail(env);
    return false;
  }
  if (!ok) return throw_nomem(env, "step");
  if (is_first) values->count++;
  return true;
}

// Appends the values of the row of stmt's last step, or returns false with an
// exception pending.
static bool append_row(napi_env env, Values *values, sqlite3_stmt *stmt) {
  for (int i = 0; i < sqlite3_column_count(stmt); i++)
    if (!append_column(env, values, stmt, i)) return false;
  return true;
}

// Returns an ArrayBuffer of at least size bytes for a call's values, and its
// memory in *data: the one the environment keeps, when it's large enough and
// attached, or a new one, doubled, which it keeps up to KEPT_BUFFER. It returns
// NULL with an exception pending.
static napi_value get_buffer(napi_env env, Environment *environment,
                             size_t size, void **data) {
  napi_value buffer;
  size_t capacity = 0;
  *data = NULL;
  if (environment->buffer != NULL) {
    // A detached one has no memory.
    if (napi_get_reference_value(env, environment->buffer, &buffer) !=
            napi_ok ||
        napi_get_arraybuffer_info(env, buffer, data, &capacity) != napi_ok)
      return fail(env);
    if (*data != NULL && capacity >= size) return buffer;
  }
  size_t created = size;
  if (created < 2 * capacity && 2 * capacity <= KEPT_BUFFER)
    created = 2 * capacity;
  if (napi_create_arraybuffer(env, created, data, &buffer) != napi_ok)
    return fail(env);
  if (created <= KEPT_BUFFER) {
    if (environment->buffer != NULL)
      napi_delete_reference(env, environment->buffer);
    environment->buffer = NULL;
    if (napi_create_reference(env, buffer, 1, &environment->buffer) != napi_ok)
      return fail(env);
  }
  return buffer;
}

// Passes the Node-API texts and blobs of the values after the first to the
// environment's takeTexts, each chunk after whether it's the call's first, so
// a call that failed before its rows leaves none for the next, then calls a
// function of its row builder with names, changes and the count of values, and
// then the values, or, when there are more than ARGUMENT_VALUES, an ArrayBuffer
// of all of them, as NativeSqliteRows.ts reads it, which get_buffer returns
// after they're passed, so no JavaScript runs before the call, and the texts
// and blobs of the first: the byte length of the short texts and the numbers,
// as doubles, then the kinds, the short texts and the bytes. It returns NULL
// with an exception pending.
static napi_value call_with_values(napi_env env, Environment *environment,
                                   napi_ref function, const Values *values,
                                   napi_value names, sqlite3_int64 changes) {
  napi_value chunk[1 + TEXT_CHUNK];
  for (size_t i = 0; i < values->text_count; i += TEXT_CHUNK) {
    size_t count = values->text_count - i;
    if (count > TEXT_CHUNK) count = TEXT_CHUNK;
    if (napi_get_boolean(env, i == 0, &chunk[0]) != napi_ok) return fail(env);
    memcpy(chunk + 1, values->texts + i, count * sizeof *chunk);
    if (call(env, environment, environment->take_texts, 1 + count, chunk) ==
        NULL)
      return NULL;
  }
  napi_value argv[4 + ARGUMENT_VALUES];
  argv[0] = names;
  if (napi_create_int64(env, changes, &argv[1]) != napi_ok ||
      napi_create_uint32(env, values->count, &argv[2]) != napi_ok)
    return fail(env);
  size_t argc = 3;
  if (values->count <= ARGUMENT_VALUES) {
    for (uint32_t i = 0; i < values->count; i++) {
      napi_value *value = &argv[argc++];
      *value = values->first[i];
      if (*value == NULL &&
          (values->first_kinds[i] == VALUE_NUMBER
               ? napi_create_double(env, values->first_numbers[i], value)
               : napi_get_null(env, value)) != napi_ok)
        return fail(env);
    }
    return call(env, environment, function, argc, argv);
  }
  // The first values' numbers and kinds too, so the call creates no Node-API
  // value of a number or NULL.
  size_t count = values->count;
  size_t buffered = count - ARGUMENT_VALUES;
  size_t numbers = sizeof(double) * (1 + count);
  size_t size = numbers + count + values->text_size + values->bytes_size;
  void *data;
  argv[argc] = get_buffer(env, environment, size, &data);
  if (argv[argc++] == NULL) return NULL;
  unsigned char *buffer = data;
  double text_size = (double)values->text_size;
  memcpy(buffer, &text_size, sizeof text_size);
  memcpy(buffer + sizeof text_size, values->first_numbers,
         sizeof(double) * ARGUMENT_VALUES);
  memcpy(buffer + sizeof text_size + sizeof(double) * ARGUMENT_VALUES,
         values->numbers, sizeof(double) * buffered);
  unsigned char *kinds = buffer + numbers;
  for (uint32_t i = 0; i < ARGUMENT_VALUES; i++) {
    uint8_t kind = values->first_kinds[i];
    if (kind == VALUE_TEXT || kind == VALUE_BLOB) {
      kinds[i] = VALUE_OBJECT;
      argv[argc++] = values->first[i];
    } else {
      kinds[i] = kind;
    }
  }
  memcpy(kinds + ARGUMENT_VALUES, values->kinds, buffered);
  if (values->text_size > 0)
    memcpy(kinds + count, values->text, values->text_size);
  if (values->bytes_size > 0)
    memcpy(kinds + count + values->text_size, values->bytes,
           values->bytes_size);
  return call(env, environment, function, argc, argv);
}

// Creates the keys of stmt's column names, an array-like object with the
// builder's row prototype, through the environment's values, or returns NULL
// with an exception pending.
static napi_value create_names(napi_env env, Environment *environment,
                               sqlite3_stmt *stmt) {
  // Every key before the holder, whose getters and setters, of a row builder
  // other than NativeSqliteRows.ts, can close the database, finalizing stmt.
  uint32_t count = (uint32_t)sqlite3_column_count(stmt);
  napi_value stack[ARGUMENT_VALUES];
  napi_value *keys = count <= ARGUMENT_VALUES
                         ? stack
                         : malloc((size_t)count * sizeof *keys);
  if (keys == NULL) return throw_nomem(env, "step");
  bool ok = true;
  for (uint32_t i = 0; ok && i < count; i++) {
    const char *name = sqlite3_column_name(stmt, (int)i);
    if (name == NULL) {
      throw_sqlite(env, "step", sqlite3_db_handle(stmt), SQLITE_NOMEM);
      ok = false;
    } else if (node_api_create_property_key_utf8(env, name, strlen(name),
                                                 &keys[i]) != napi_ok) {
      fail(env);
      ok = false;
    }
  }
  napi_value values = NULL, argv, result = NULL;
  if (ok) {
    // The holder and its values are the row builder's.
    environment->javascript_calls++;
    values = get_values(env, environment);
    ok = values != NULL;
  }
  for (uint32_t i = 0; ok && i < count; i++) {
    ok = napi_set_element(env, values, i, keys[i]) == napi_ok;
    if (!ok) fail(env);
  }
  if (ok && napi_create_uint32(env, count, &argv) != napi_ok) {
    fail(env);
    ok = false;
  }
  if (ok) result = call(env, environment, environment->take, 1, &argv);
  if (keys != stack) free(keys);
  return result;
}

// The keys of the column names of a database's run or a statement's
// preparation, which the environment keeps for its last few lists of names,
// since a run or statement of the same columns, such as one prepared again or
// of other literals, is common, and creating the keys costs more than
// comparing the names. It returns NULL with an exception pending.
static napi_value get_run_names(napi_env env, Environment *environment,
                                sqlite3_stmt *stmt) {
  char names[RUN_NAMES_SIZE];
  size_t size = 0;
  for (int i = 0; i < sqlite3_column_count(stmt); i++) {
    const char *name = sqlite3_column_name(stmt, i);
    if (name == NULL)
      return throw_sqlite(env, "step", sqlite3_db_handle(stmt), SQLITE_NOMEM);
    size_t length = strlen(name) + 1;
    if (length > sizeof names - size)
      return create_names(env, environment, stmt);
    memcpy(names + size, name, length);
    size += length;
  }
  napi_value keys;
  for (size_t i = 0; i < RUN_NAMES; i++) {
    const RunNames *kept = &environment->run_names[i];
    if (kept->keys != NULL && kept->size == size &&
        memcmp(kept->names, names, size) == 0)
      return napi_get_reference_value(env, kept->keys, &keys) == napi_ok
                 ? keys
                 : fail(env);
  }
  keys = create_names(env, environment, stmt);
  napi_ref reference;
  if (keys == NULL) return NULL;
  if (napi_create_reference(env, keys, 1, &reference) != napi_ok)
    return fail(env);
  RunNames *kept = &environment->run_names[environment->next_run_names];
  if (kept->keys != NULL) napi_delete_reference(env, kept->keys);
  kept->keys = reference;
  memcpy(kept->names, names, size);
  kept->size = size;
  environment->next_run_names = (environment->next_run_names + 1) % RUN_NAMES;
  return keys;
}

// The keys of the statement's column names, which it reads again, from the
// environment's lists or creates, unless it has them for its current
// preparation, which a schema change replaces, or NULL with an exception
// pending.
static napi_value get_names(napi_env env, Statement *statement) {
  int reprepares =
      sqlite3_stmt_status(statement->stmt, SQLITE_STMTSTATUS_REPREPARE, 0);
  napi_value names;
  if (statement->names != NULL && reprepares == statement->reprepares) {
    if (napi_get_reference_value(env, statement->names, &names) != napi_ok)
      return fail(env);
    return names;
  }
  names =
      get_run_names(env, statement->database->environment, statement->stmt);
  if (names == NULL) return NULL;
  free_column_names(env, statement);
  if (napi_create_reference(env, names, 1, &statement->names) != napi_ok)
    return fail(env);
  statement->reprepares = reprepares;
  return names;
}

// Steps the statement to its end, appending the values of its rows, after it
// sets *names to the keys of its column names at the first row, cached unless
// the statement is a database run's. It returns SQLite's result, or -1 with
// an exception pending. Creating the keys calls the row builder's take, which
// can call a function JavaScript replaced before NativeSqliteRows.ts loaded,
// so it checks the statement after that, throwing that it's finalized, or for
// a database run's that the database is closed, before it uses it again.
static int step_rows(napi_env env, Statement *statement, bool caches_names,
                     napi_value *names, Values *values) {
  Environment *environment = statement->database->environment;
  sqlite3_stmt *stmt = statement->stmt;
  int rc;
  while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
    statement->has_row = true;
    if (*names == NULL) {
      *names = caches_names ? get_names(env, statement)
                            : get_run_names(env, environment, stmt);
      if (*names == NULL) return -1;
      if (!is_live(statement)) {
        throw_plain_error(env, caches_names ? "The statement is finalized."
                                            : "The database is closed.");
        return -1;
      }
    }
    if (!append_row(env, values, stmt)) return -1;
  }
  return rc;
}

// The rows a run of stmt changed, from the total changes before it. SQLite
// keeps the count of the last INSERT, UPDATE or DELETE across other
// statements, and a statement that can't write changes no rows itself.
static sqlite3_int64 changes_of(sqlite3_stmt *stmt,
                                sqlite3_int64 total_changes) {
  sqlite3 *db = sqlite3_db_handle(stmt);
  return sqlite3_total_changes64(db) == total_changes ||
                 sqlite3_stmt_readonly(stmt)
             ? 0
             : sqlite3_changes64(db);
}

// The memory the environment shares with its row builder, as a call holds it:
// fetched when the call first uses it, and again when C let JavaScript run
// since, which could have detached it if the row builder isn't
// NativeSqliteRows.ts.
typedef struct {
  double *numbers;
  uint64_t javascript_calls;
} Shared;

// Returns the shared memory, or NULL with an Error pending once it's detached.
static double *get_shared(napi_env env, const Environment *environment,
                          Shared *shared) {
  if (shared->numbers != NULL &&
      shared->javascript_calls == environment->javascript_calls)
    return shared->numbers;
  napi_value buffer;
  void *data = NULL;
  size_t size = 0;
  if (napi_get_reference_value(env, environment->shared, &buffer) != napi_ok ||
      napi_get_arraybuffer_info(env, buffer, &data, &size) != napi_ok)
    return fail(env);
  if (size != SHARED_SIZE)
    return throw_plain_error(env,
                             "The memory the row builder shares is detached.");
  shared->numbers = data;
  shared->javascript_calls = environment->javascript_calls;
  return data;
}

// Counts a call that stepped, reset, bound or finalized a statement or closed
// a database, for the row builder, or returns false with an Error pending.
static bool count_call(napi_env env, const Environment *environment,
                       Shared *shared) {
  double *numbers = get_shared(env, environment, shared);
  if (numbers != NULL) numbers[SHARED_CALLS]++;
  return numbers != NULL;
}

// What a run or step returns: a run's changes when it returned no row; the
// keys of its column names when its values are a few numbers or NULLs and at
// most one text or blob, which it writes to the shared memory and the row
// builder's objects, since setting an element costs less than calling it,
// setting *is_shared; and otherwise what the row builder's function builds of
// its values, a run's rows when it changed none and both otherwise, or a
// step's row. Building a run's rows can run a setter of Array.prototype. It
// returns NULL with an exception pending.
static napi_value create_result(napi_env env, Environment *environment,
                                Shared *shared, const Values *values,
                                napi_value names, sqlite3_int64 changes,
                                napi_ref function, bool *is_shared) {
  *is_shared = values->count > 0 && values->count <= ARGUMENT_VALUES &&
               values->object_count <= 1;
  double *numbers;
  if (*is_shared) {
    numbers = get_shared(env, environment, shared);
    if (numbers == NULL) return NULL;
    numbers[SHARED_COUNT] = values->count;
    numbers[SHARED_CHANGES] = (double)changes;
    memcpy(numbers + SHARED_NUMBERS, values->first_numbers,
           sizeof(double) * values->count);
    memcpy(numbers + SHARED_NUMBERS + ARGUMENT_VALUES, values->first_kinds,
           values->count);
    // Last, since the objects are the row builder's, whose set could run
    // JavaScript, and an own element of NativeSqliteRows.ts's array, so it
    // runs no setter.
    if (values->object_count == 0) return names;
    environment->javascript_calls++;
    napi_value objects;
    if (napi_get_reference_value(env, environment->objects, &objects) !=
            napi_ok ||
        napi_set_element(env, objects, 0,
                         values->first[values->object_index]) != napi_ok)
      return fail(env);
    return names;
  }
  napi_value result = NULL;
  if (values->count > 0)
    result =
        call_with_values(env, environment, function, values, names, changes);
  else if (napi_create_int64(env, changes, &result) != napi_ok)
    result = fail(env);
  // After the row builder, whose setters can run another statement.
  numbers = get_shared(env, environment, shared);
  if (numbers == NULL) return NULL;
  numbers[SHARED_COUNT] = 0;
  return result;
}

// Binds a value and returns SQLite's result, or -1 with an exception pending.
// It sets *is_large for a text or blob over MAX_KEPT_VALUE.
static int bind_value(napi_env env, sqlite3_stmt *stmt, int index,
                      napi_value value, bool *is_large) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok) return fail_code(env);
  switch (type) {
  case napi_null:
    return sqlite3_bind_null(stmt, index);
  case napi_number: {
    double number;
    if (napi_get_value_double(env, value, &number) != napi_ok)
      return fail_code(env);
    // Clang's, since macOS defines isfinite as a macro whose folded checks of
    // its argument's size coverage counts as branches never taken.
    if (!__builtin_isfinite(number)) break;
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
    if (size > MAX_KEPT_VALUE) *is_large = true;
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
    if (size > MAX_KEPT_VALUE) *is_large = true;
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

// Throws the TypeError of count parameters where expected are.
static void *throw_parameter_count(napi_env env, int expected,
                                   uint32_t count) {
  char message[64];
  // SQLite's, since macOS defines snprintf as a fortified macro, whose folded
  // check coverage counts as a branch never taken.
  sqlite3_snprintf(sizeof message, message, "Expected %d parameters, got %u.",
                   expected, count);
  return throw_type_error(env, message);
}

// How many parameters a call reads into memory of its own.
#define STACK_PARAMETERS 16

// Reads an array of parameters, each with an ordinary get, into stack, which
// holds STACK_PARAMETERS, or else into an array that the caller frees, and
// returns the array of *count values or NULL with an exception pending. With
// expected at 0 or more, an array of another length throws a TypeError before
// an element is read. An array longer than limit, more parameters than any
// statement has, returns stack with no element read, for the caller's check of
// the count to refuse, so a huge sparse array costs nothing.
static napi_value *read_parameters(napi_env env, Environment *environment,
                                   napi_value parameters, int expected,
                                   uint32_t limit, napi_value *stack,
                                   uint32_t *count) {
  bool is_array = false;
  if (napi_is_array(env, parameters, &is_array) != napi_ok) return fail(env);
  if (!is_array)
    return throw_type_error(env, "The parameters must be an array.");
  if (napi_get_array_length(env, parameters, count) != napi_ok)
    return fail(env);
  if (expected >= 0 && *count != (uint32_t)expected)
    return throw_parameter_count(env, expected, *count);
  if (*count > limit) return stack;
  napi_value *values = *count <= STACK_PARAMETERS
                           ? stack
                           : malloc((size_t)*count * sizeof *values);
  if (values == NULL) return throw_nomem(env, "bind");
  // An element's getter is JavaScript.
  if (*count > 0) environment->javascript_calls++;
  for (uint32_t i = 0; i < *count; i++)
    if (napi_get_element(env, parameters, i, &values[i]) != napi_ok) {
      if (values != stack) free(values);
      return fail(env);
    }
  return values;
}

// Binds the values to stmt, or returns false with an exception pending. It
// sets *has_large when it bound a text or blob over MAX_KEPT_VALUE, also when
// a later one failed.
static bool bind_values(napi_env env, sqlite3_stmt *stmt,
                        const napi_value *values, uint32_t count,
                        bool *has_large) {
  evolu_database_discard_failure(sqlite3_db_handle(stmt));
  for (uint32_t i = 0; i < count; i++) {
    int rc = bind_value(env, stmt, (int)i + 1, values[i], has_large);
    if (rc > 0) throw_sqlite(env, "bind", sqlite3_db_handle(stmt), rc);
    if (rc != SQLITE_OK) return false;
  }
  return true;
}

// Binds an array of exactly the statement's number of parameters, or returns
// false with an exception pending. Reading an element can run JavaScript,
// which could have finalized the statement or closed its database.
static bool bind_parameters(napi_env env, Statement *statement,
                            napi_value parameters, bool *has_large) {
  uint32_t count;
  napi_value stack[STACK_PARAMETERS];
  napi_value *values =
      read_parameters(env, statement->database->environment, parameters,
                      statement->parameter_count,
                      (uint32_t)statement->parameter_count, stack, &count);
  if (values == NULL) return false;
  bool ok = is_live(statement);
  if (ok)
    ok = bind_values(env, statement->stmt, values, count, has_large);
  else
    throw_plain_error(env, "The statement is finalized.");
  if (values != stack) free(values);
  return ok;
}

// Reads a native's arguments, missing ones as undefined, and the environment
// it was created for.
static bool get_native_args(napi_env env, napi_callback_info info,
                            size_t count, napi_value *argv,
                            Environment **environment) {
  size_t argc = count;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, (void **)environment) ==
      napi_ok)
    return true;
  fail(env);
  return false;
}

// The run of a statement whose id the row builder's run passes, with the
// parameters, and the shared memory's count of values: 0 for a result it
// returns, and otherwise for the values it holds of the keys it returns.
static napi_value native_run(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  Environment *environment;
  if (!get_native_args(env, info, 2, argv, &environment)) return NULL;
  Statement *statement = get_live_statement_by_id(env, environment, argv[0]);
  if (statement == NULL) return NULL;
  // SQLite keeps a copy of each bound value until its parameter is bound
  // again, so a run that bound a large one clears the bindings after its
  // reset, also when it fails.
  bool has_large = false;
  bool ok = bind_parameters(env, statement, argv[1], &has_large);
  // After the parameters, whose getters are JavaScript, so a run fetches the
  // shared memory once, and also for a bind that failed, which resets it.
  Shared shared = {NULL, 0};
  ok = count_call(env, environment, &shared) && ok;
  if (!ok) {
    if (is_live(statement)) {
      sqlite3_reset(statement->stmt);
      if (has_large) sqlite3_clear_bindings(statement->stmt);
      statement->has_row = false;
    }
    return NULL;
  }
  sqlite3_stmt *stmt = statement->stmt;
  sqlite3 *db = sqlite3_db_handle(stmt);
  sqlite3_int64 total_changes = sqlite3_total_changes64(db);
  napi_value names = NULL;
  Values values;
  start_values(&values, environment);
  int rc = step_rows(env, statement, true, &names, &values);
  // A failed step's error, read before the reset repeats it.
  evolu_database_error record;
  if (rc > 0 && rc != SQLITE_DONE) evolu_database_set_error(&record, db, rc);
  // Unless creating the keys of its column names finalized it.
  if (is_live(statement)) {
    sqlite3_reset(stmt);
    if (has_large) sqlite3_clear_bindings(stmt);
  }
  statement->has_row = false;
  napi_value result = NULL;
  bool is_shared = false;
  double calls = 0;
  if (rc == SQLITE_DONE) {
    double *numbers = get_shared(env, environment, &shared);
    if (numbers == NULL) {
      rc = -1;
    } else {
      calls = numbers[SHARED_CALLS];
      result = create_result(env, environment, &shared, &values, names,
                             changes_of(stmt, total_changes),
                             environment->create_rows, &is_shared);
    }
  }
  free_values(&values, environment);
  if (rc < 0) return NULL;
  if (rc != SQLITE_DONE) return throw_record(env, "step", &record);
  // The row builder appends the shared values' rows and settles it.
  if (is_shared) return result;
  double *numbers = get_shared(env, environment, &shared);
  if (numbers == NULL) return NULL;
  // Without a call counted since the reset, no setter changed the statement.
  if (numbers[SHARED_CALLS] == calls) return result;
  // A setter could have finalized the statement or stepped it.
  if (!is_live(statement))
    return result == NULL
               ? NULL
               : throw_plain_error(env, "The statement is finalized.");
  sqlite3_reset(stmt);
  statement->has_row = false;
  return result;
}

// After the row builder appended the rows of a statement's run, which can run
// a setter of Array.prototype, throws that it's finalized when it is, and
// resets it, which a setter could have stepped.
static napi_value native_settle(napi_env env, napi_callback_info info) {
  napi_value id;
  Environment *environment;
  if (!get_native_args(env, info, 1, &id, &environment)) return NULL;
  Statement *statement = get_live_statement_by_id(env, environment, id);
  Shared shared = {NULL, 0};
  if (statement == NULL || !count_call(env, environment, &shared)) return NULL;
  sqlite3_reset(statement->stmt);
  statement->has_row = false;
  return undefined(env);
}

static napi_value js_bind(napi_env env, napi_callback_info info) {
  napi_value argv[1], this_value;
  if (!get_args(env, info, 1, argv, &this_value)) return NULL;
  Statement *statement = get_live_statement(env, this_value);
  Shared shared = {NULL, 0};
  if (statement == NULL ||
      !count_call(env, statement->database->environment, &shared))
    return NULL;
  // The steps that follow need the values, however large.
  bool has_large = false;
  if (!bind_parameters(env, statement, argv[0], &has_large)) return NULL;
  return undefined(env);
}

// A statement's step, by the id that the row builder's step passes, as a run
// is: the keys of its column names, with its row's values in the shared memory
// and objects, when they're a few numbers or NULLs and at most one text or
// blob, which the row builder's step builds the row of; otherwise its row,
// which the row builder's createRowOfStep builds, or null at its end, with the
// shared count 0.
static napi_value native_step(napi_env env, napi_callback_info info) {
  napi_value id;
  Environment *environment;
  if (!get_native_args(env, info, 1, &id, &environment)) return NULL;
  Statement *statement = get_live_statement_by_id(env, environment, id);
  Shared shared = {NULL, 0};
  if (statement == NULL || !count_call(env, environment, &shared)) return NULL;
  sqlite3 *db = sqlite3_db_handle(statement->stmt);
  evolu_database_discard_failure(db);
  int rc = sqlite3_step(statement->stmt);
  statement->has_row = rc == SQLITE_ROW;
  if (rc == SQLITE_ROW) {
    napi_value names = get_names(env, statement);
    // Creating the keys can finalize it or close its database, as step_rows
    // describes.
    if (names != NULL && !is_live(statement))
      return throw_plain_error(env, "The statement is finalized.");
    Values values;
    start_values(&values, environment);
    bool is_shared = false;
    napi_value row = names != NULL && append_row(env, &values, statement->stmt)
                         ? create_result(env, environment, &shared, &values,
                                         names, 0, environment->create_row,
                                         &is_shared)
                         : NULL;
    free_values(&values, environment);
    return row;
  }
  if (rc != SQLITE_DONE) return throw_sqlite(env, "step", db, rc);
  // No JavaScript ran since count_call fetched the shared memory.
  shared.numbers[SHARED_COUNT] = 0;
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
  Shared shared = {NULL, 0};
  if (statement == NULL ||
      !count_call(env, statement->database->environment, &shared))
    return NULL;
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
  Shared shared = {NULL, 0};
  if (statement == NULL ||
      !count_call(env, statement->database->environment, &shared))
    return NULL;
  bool had_row = statement->has_row;
  sqlite3 *db = sqlite3_db_handle(statement->stmt);
  evolu_database_discard_failure(db);
  int rc = sqlite3_finalize(statement->stmt);
  statement->stmt = NULL;
  statement->has_row = false;
  free_column_names(env, statement);
  if (rc != SQLITE_OK && had_row) return throw_sqlite(env, "step", db, rc);
  return undefined(env);
}

// How many bytes of SQL a database's run converts into memory of its own.
#define STACK_SQL 1024

// Returns SQL as UTF-8, which a NUL follows, in stack, which holds STACK_SQL
// bytes, when it fits, and otherwise from sqlite3_malloc64, with its byte
// length in *size, or NULL with an exception pending: a TypeError for a value
// that isn't a string, and an error for a lone surrogate, which it looks for
// unless is_well_formed. A NULL stack converts into sqlite3_malloc64.
static char *get_sql(napi_env env, napi_value value, bool is_well_formed,
                     char *stack, size_t *size) {
  char *sql = NULL;
  napi_valuetype type;
  if (stack != NULL) {
    if (napi_typeof(env, value, &type) != napi_ok) return fail(env);
    if (type != napi_string)
      return throw_type_error(env, "The SQL must be a string.");
    if (napi_get_value_string_utf8(env, value, stack, STACK_SQL, size) !=
        napi_ok)
      return fail(env);
    // Node-API writes only whole characters, of up to 4 bytes, so SQL with
    // fewer bytes than those left over fit.
    if (*size + 4 < STACK_SQL - 1) sql = stack;
  }
  if (sql == NULL)
    sql = get_utf8(env, value, "The SQL must be a string.", "prepare", size);
  if (sql == NULL) return NULL;
  int lone = is_well_formed ? 0 : has_lone_surrogate(env, value, "prepare");
  if (lone == 0) return sql;
  if (sql != stack) sqlite3_free(sql);
  return lone < 0 ? NULL
                  : throw_own(env, "prepare",
                              EVOLU_DATABASE_ERROR_INVALID_SQL_TEXT,
                              SQLITE_MISUSE,
                              "The SQL contains a lone surrogate.");
}

static napi_value js_prepare(napi_env env, napi_callback_info info) {
  napi_value argv[1], this_value;
  if (!get_args(env, info, 1, argv, &this_value)) return NULL;
  Database *database = get_open_database(env, this_value);
  if (database == NULL) return NULL;
  size_t size;
  char *sql = get_sql(env, argv[0], false, NULL, &size);
  if (sql == NULL) return NULL;
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
  database->references++;
  napi_value handle =
      create_handle(env, database->environment, HANDLE_STATEMENT, statement,
                    &statement->slot, collect_statement);
  if (handle == NULL) {
    sqlite3_finalize(stmt);
    release_database(database);
    free(statement);
  }
  return handle;
}

// Prepares, binds, steps and finalizes one statement, with no handle of its
// own, for the row builder's run of the database whose id it passes, with the
// SQL, the parameters and whether the SQL is well-formed, which JavaScript
// checks faster. It reads the parameters before it prepares, since reading
// them can run JavaScript that closes the database, and the row builder
// appends the rows after the finalize. It sets the shared memory's count of
// values as a statement's run does.
static napi_value native_database_run(napi_env env, napi_callback_info info) {
  napi_value argv[4];
  Environment *environment;
  if (!get_native_args(env, info, 4, argv, &environment)) return NULL;
  Database *database = get_open_database_by_id(env, environment, argv[0]);
  if (database == NULL) return NULL;
  bool is_well_formed = false;
  if (napi_get_value_bool(env, argv[3], &is_well_formed) != napi_ok)
    is_well_formed = false;
  size_t size;
  char stack_sql[STACK_SQL];
  char *sql = get_sql(env, argv[1], is_well_formed, stack_sql, &size);
  if (sql == NULL) return NULL;
  uint32_t parameter_count;
  napi_value stack[STACK_PARAMETERS];
  // No JavaScript has run, so the database is open.
  int limit = sqlite3_limit(evolu_database_connection(database->database),
                            SQLITE_LIMIT_VARIABLE_NUMBER, -1);
  napi_value *parameters = read_parameters(env, environment, argv[2], -1,
                                           (uint32_t)limit,
                                           stack, &parameter_count);
  sqlite3_stmt *stmt = NULL;
  evolu_database_error record;
  int rc = SQLITE_OK;
  // Counted after the parameters, as a statement's run counts its call.
  Shared shared = {NULL, 0};
  if (parameters == NULL || !count_call(env, environment, &shared)) {
    rc = -1;
  } else if (database->database == NULL) {
    throw_plain_error(env, "The database is closed.");
    rc = -1;
  } else {
    rc = evolu_database_prepare(database->database, sql, size, &stmt, &record);
    if (rc != SQLITE_OK) throw_record(env, "prepare", &record);
  }
  if (sql != stack_sql) sqlite3_free(sql);
  if (rc != SQLITE_OK) {
    if (parameters != stack) free(parameters);
    return NULL;
  }
  Statement statement = {.stmt = stmt,
                         .database = database,
                         .closes = database->closes,
                         .parameter_count = sqlite3_bind_parameter_count(stmt)};
  bool has_large = false;
  bool ok = parameter_count == (uint32_t)statement.parameter_count;
  if (ok)
    ok = bind_values(env, stmt, parameters, parameter_count, &has_large);
  else
    throw_parameter_count(env, statement.parameter_count, parameter_count);
  if (parameters != stack) free(parameters);
  sqlite3 *db = sqlite3_db_handle(stmt);
  sqlite3_int64 total_changes = sqlite3_total_changes64(db);
  napi_value names = NULL;
  Values values;
  start_values(&values, environment);
  rc = ok ? step_rows(env, &statement, false, &names, &values) : -1;
  if (rc > 0 && rc != SQLITE_DONE) evolu_database_set_error(&record, db, rc);
  // Unless creating the keys of its column names closed the database, which
  // finalized it.
  sqlite3_int64 changes = 0;
  if (is_live(&statement)) {
    changes = changes_of(stmt, total_changes);
    sqlite3_finalize(stmt);
  }
  bool is_shared = false;
  napi_value result = rc == SQLITE_DONE
                          ? create_result(env, environment, &shared, &values,
                                          names, changes,
                                          environment->create_rows, &is_shared)
                          : NULL;
  free_values(&values, environment);
  if (rc < 0) return NULL;
  if (rc != SQLITE_DONE) return throw_record(env, "step", &record);
  return result;
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
  // Node-API refuses only a NULL result, so the status is ignored, as the
  // finalizer ignores it when it takes the size back.
  int64_t adjusted;
  napi_adjust_external_memory(env, (int64_t)size, &adjusted);
  return buffer;
}

// Never throws for an error SQLite reports: a connection SQLite can't close
// stays open, holding its file, and a later close tries again.
static napi_value js_close(napi_env env, napi_callback_info info) {
  napi_value this_value;
  if (!get_args(env, info, 0, NULL, &this_value)) return NULL;
  Database *database =
      get_this(env, this_value, database_tag, "Expected a database.");
  Shared shared = {NULL, 0};
  if (database == NULL || !count_call(env, database->environment, &shared))
    return NULL;
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
// reads it. A length-tracking view of a growable SharedArrayBuffer grows when
// another thread grows the buffer meanwhile, so an input longer than the one
// the output was sized for throws.
static napi_value js_encrypt_xchacha(napi_env env, napi_callback_info info) {
  napi_value argv[3];
  if (!get_args(env, info, 3, argv, NULL)) return NULL;
  uint8_t *key, *nonce, *plaintext, *output_bytes;
  size_t size, reread;
  if (!get_xchacha_arguments(env, argv, &key, &nonce, &plaintext, &size))
    return NULL;
  napi_value output =
      create_output(env, size + EVOLU_XCHACHA_TAG_SIZE, &output_bytes);
  if (output == NULL ||
      !get_xchacha_arguments(env, argv, &key, &nonce, &plaintext, &reread))
    return NULL;
  if (reread != size)
    return throw_plain_error(env, "The input grew while it was read.");
  evolu_xchacha_encrypt(output_bytes, key, nonce, plaintext, size);
  return output;
}

static napi_value js_decrypt_xchacha(napi_env env, napi_callback_info info) {
  napi_value argv[3];
  if (!get_args(env, info, 3, argv, NULL)) return NULL;
  uint8_t *key, *nonce, *ciphertext, *output_bytes;
  size_t size, reread;
  if (!get_xchacha_arguments(env, argv, &key, &nonce, &ciphertext, &size))
    return NULL;
  if (size < EVOLU_XCHACHA_TAG_SIZE)
    return throw_plain_error(env, "The ciphertext doesn't authenticate.");
  napi_value output =
      create_output(env, size - EVOLU_XCHACHA_TAG_SIZE, &output_bytes);
  if (output == NULL ||
      !get_xchacha_arguments(env, argv, &key, &nonce, &ciphertext, &reread))
    return NULL;
  if (reread != size)
    return throw_plain_error(env, "The input grew while it was read.");
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

// The members of the row builder: the ones the environment keeps references
// to, in their order, then the runs and step that the prototypes hold and its
// connect.
static const char *const row_builder_members[] = {
    "holder",    "objects", "take", "createRows",  "createRowOfStep",
    "takeTexts", "run",     "step", "runDatabase", "connect"};
#define ROW_BUILDER_MEMBERS                                                    \
  (sizeof row_builder_members / sizeof row_builder_members[0])
// The members that are objects, before the functions.
#define OBJECT_MEMBERS 2
#define KEPT_MEMBERS 6
enum {
  MEMBER_RUN = KEPT_MEMBERS,
  MEMBER_STEP,
  MEMBER_RUN_DATABASE,
  MEMBER_CONNECT
};

// Reads the members of a row builder, an object whose holder and objects are
// objects and whose other members are functions, or returns false with a
// TypeError.
static bool read_row_builder(napi_env env, napi_value row_builder,
                             napi_value *members) {
  napi_valuetype type;
  if (napi_typeof(env, row_builder, &type) != napi_ok) {
    fail(env);
    return false;
  }
  bool is_valid = type == napi_object;
  for (size_t i = 0; is_valid && i < ROW_BUILDER_MEMBERS; i++) {
    if (napi_get_named_property(env, row_builder, row_builder_members[i],
                                &members[i]) != napi_ok ||
        napi_typeof(env, members[i], &type) != napi_ok) {
      fail(env);
      return false;
    }
    is_valid = type == (i < OBJECT_MEMBERS ? napi_object : napi_function);
  }
  if (is_valid) return true;
  throw_type_error(env, "createBinding takes the row builder of "
                        "@evolu/nodejs's NativeSqliteRows.ts.");
  return false;
}

// Deletes the references an environment that failed to start has.
static void delete_references(napi_env env, Environment *environment) {
  napi_ref *references[] = {
      &environment->database_class, &environment->statement_class,
      &environment->holder,         &environment->objects,
      &environment->take,
      &environment->create_rows,    &environment->create_row,
      &environment->take_texts,     &environment->database_key,
      &environment->statement_key,  &environment->shared};
  for (size_t i = 0; i < sizeof references / sizeof references[0]; i++)
    if (*references[i] != NULL) napi_delete_reference(env, *references[i]);
}

// Creates the environment's state on its first createBinding: the classes of
// the handles, whose prototypes hold the row builder's runs, the keys of
// their ids, references to the row builder and the shared memory. Then it
// connects the row builder to the natives its runs call, the shared memory
// and the keys, and installs the state as the environment's. It returns NULL
// with an exception pending.
static Environment *create_environment(napi_env env,
                                       const napi_value *row_builder) {
  Environment *environment = calloc(1, sizeof *environment);
  if (environment == NULL) return throw_nomem(env, "open");
  environment->free_handle = UINT32_MAX;
  environment->references = 1;
  napi_property_descriptor database_methods[] = {
      {"prepare", NULL, js_prepare, NULL, NULL, NULL, napi_default_method,
       NULL},
      {"run", NULL, NULL, NULL, NULL, row_builder[MEMBER_RUN_DATABASE],
       napi_default_method, NULL},
      {"export", NULL, js_export, NULL, NULL, NULL, napi_default_method, NULL},
      {"close", NULL, js_close, NULL, NULL, NULL, napi_default_method, NULL},
  };
  napi_property_descriptor statement_methods[] = {
      {"run", NULL, NULL, NULL, NULL, row_builder[MEMBER_RUN],
       napi_default_method, NULL},
      {"bind", NULL, js_bind, NULL, NULL, NULL, napi_default_method, NULL},
      {"step", NULL, NULL, NULL, NULL, row_builder[MEMBER_STEP],
       napi_default_method, NULL},
      {"reset", NULL, js_reset, NULL, NULL, NULL, napi_default_method, NULL},
      {"finalize", NULL, js_finalize, NULL, NULL, NULL, napi_default_method,
       NULL},
  };
  // The methods go on the prototypes as plain functions, since a class's own
  // methods would let V8 refuse another kind of `this` with its own message.
  napi_value database_class, database_prototype, statement_class,
      statement_prototype, database_key, statement_key, shared;
  bool ok =
      napi_define_class(env, "NativeSqliteDatabase", NAPI_AUTO_LENGTH,
                        construct, NULL, 0, NULL, &database_class) == napi_ok &&
      napi_get_named_property(env, database_class, "prototype",
                              &database_prototype) == napi_ok &&
      napi_define_properties(
          env, database_prototype,
          sizeof database_methods / sizeof database_methods[0],
          database_methods) == napi_ok &&
      napi_define_class(env, "NativeSqliteStatement", NAPI_AUTO_LENGTH,
                        construct, NULL, 0, NULL,
                        &statement_class) == napi_ok &&
      napi_get_named_property(env, statement_class, "prototype",
                              &statement_prototype) == napi_ok &&
      napi_define_properties(
          env, statement_prototype,
          sizeof statement_methods / sizeof statement_methods[0],
          statement_methods) == napi_ok &&
      napi_create_symbol(env, NULL, &database_key) == napi_ok &&
      napi_create_symbol(env, NULL, &statement_key) == napi_ok &&
      napi_create_arraybuffer(env, SHARED_SIZE, NULL, &shared) == napi_ok &&
      napi_create_reference(env, database_class, 1,
                            &environment->database_class) == napi_ok &&
      napi_create_reference(env, statement_class, 1,
                            &environment->statement_class) == napi_ok &&
      napi_create_reference(env, database_key, 1,
                            &environment->database_key) == napi_ok &&
      napi_create_reference(env, statement_key, 1,
                            &environment->statement_key) == napi_ok &&
      napi_create_reference(env, shared, 1, &environment->shared) == napi_ok;
  napi_ref *kept[] = {&environment->holder,      &environment->objects,
                      &environment->take,        &environment->create_rows,
                      &environment->create_row,  &environment->take_texts};
  for (size_t i = 0; ok && i < KEPT_MEMBERS; i++)
    ok = napi_create_reference(env, row_builder[i], 1, kept[i]) == napi_ok;
  if (!ok) {
    fail(env);
    delete_references(env, environment);
    free(environment);
    return NULL;
  }
  napi_value connected[7], receiver, result;
  ok = napi_create_function(env, "run", NAPI_AUTO_LENGTH, native_run,
                            environment, &connected[0]) == napi_ok &&
       napi_create_function(env, "step", NAPI_AUTO_LENGTH, native_step,
                            environment, &connected[6]) == napi_ok &&
       napi_create_function(env, "runDatabase", NAPI_AUTO_LENGTH,
                            native_database_run, environment,
                            &connected[1]) == napi_ok &&
       napi_create_function(env, "settle", NAPI_AUTO_LENGTH, native_settle,
                            environment, &connected[2]) == napi_ok &&
       napi_get_undefined(env, &receiver) == napi_ok;
  if (!ok) {
    fail(env);
    delete_references(env, environment);
    free(environment);
    return NULL;
  }
  connected[3] = shared;
  connected[4] = statement_key;
  connected[5] = database_key;
  // Installed only once connected, so a connect that throws leaves the next
  // createBinding to start again, and never over an environment that a
  // createBinding the connect called installed. Then, and when installing it
  // fails, the row builder can hold the natives, so it stays allocated.
  if (napi_call_function(env, receiver, row_builder[MEMBER_CONNECT], 7,
                         connected, &result) != napi_ok)
    return fail(env);
  void *installed = NULL;
  if (napi_get_instance_data(env, &installed) != napi_ok) return fail(env);
  if (installed != NULL)
    return throw_plain_error(
        env, "createBinding was called while the row builder connected.");
  if (napi_set_instance_data(env, environment, finalize_environment, NULL) !=
      napi_ok)
    return fail(env);
  return environment;
}

// node/addon.c's createBinding: checks the build and returns a binding object
// for the environment.
napi_value evolu_node_create_binding(napi_env env, napi_callback_info info) {
  napi_value row_builder, members[ROW_BUILDER_MEMBERS];
  if (!get_args(env, info, 1, &row_builder, NULL) ||
      !read_row_builder(env, row_builder, members))
    return NULL;
  evolu_database_error record;
  if (evolu_database_check_build(&record) != SQLITE_OK) {
    throw_plain_error(env, record.message);
    evolu_database_clear_error(&record);
    return NULL;
  }
  Environment *environment = get_environment(env);
  if (environment == NULL) {
    bool pending = false;
    if (napi_is_exception_pending(env, &pending) != napi_ok) return fail(env);
    if (pending || create_environment(env, members) == NULL) return NULL;
  }
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
