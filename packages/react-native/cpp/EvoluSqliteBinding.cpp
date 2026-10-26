/*
 * The binding EvoluSqliteBinding.h describes. What is particular to JSI:
 *
 * - Databases and statements are plain objects with a NativeState, a
 *   Connection or a Statement, sharing a prototype of host functions. The
 *   binding's opens are bound to the database prototype, so they create
 *   handles with it however they're called. A database prototype holds the
 *   statement prototype, unenumerable, which prepare reads from its handle.
 * - Hermes creates a row natively, with a null prototype, which has no setter
 *   to run, so creating a row and setting its columns run no JavaScript.
 *   Reading a parameter can, through a getter or a Proxy, and so can appending
 *   a row to a run's rows, through a setter of Array.prototype. A run or a
 *   bind reads every parameter before it binds one, and both check the
 *   statement again after reading them, as a run does after appending each
 *   row, throwing that it's finalized before SQLite could use it again. A
 *   database's run reads them before it prepares its statement and checks
 *   the database again, refusing more than SQLite's limit of a statement's
 *   parameters without reading one, and appends the rows after it finalizes
 *   it. A run whose setter threw resets a statement the setter stepped.
 * - The keys of a row's columns are created once per call, as PropNameIDs,
 *   not cached by the statement, since its native state holds no JSI value.
 * - Strings convert to UTF-8 with JSI, which replaces a lone surrogate with
 *   U+FFFD, as text binds it; prepare refuses SQL with one first. Hermes
 *   creates a string from UTF-8 only up to an ill-formed sequence, so TEXT,
 *   column names and error messages that aren't UTF-8 read with U+FFFD in
 *   place of each, as the WHATWG decoder and V8 read them.
 * - Errors come from the runtime: TypeErrors and errors without a cause from
 *   JSI, and an error with a cause from the global Error constructor with the
 *   cause option, which defines it unenumerable.
 */
#include "evolu_names.h"

#include "EvoluSqliteBinding.h"

#include "evolu_database.h"
#include "evolu_xchacha.h"

#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

namespace jsi = facebook::jsi;

namespace evolu {
namespace {

// The version of @evolu/common's NativeSqlite interface, which the loader
// checks against src/sqlite/Binding.ts.
constexpr int abiVersion = 2;

// The largest integer a JavaScript number holds exactly,
// Number.MAX_SAFE_INTEGER.
constexpr double maxSafeInteger = 9007199254740991.0;

// The largest text or blob, in bytes, of UTF-8 for text, whose copy a
// statement keeps after a run. @evolu/sqlite-wasm uses the same 64 KiB but
// counts 3 bytes per UTF-16 code unit of text, so it also clears some shorter
// texts.
constexpr size_t maxKeptValue = 65536;

// An open database: a database handle's state, and while it's open, an entry
// of its runtime's connections.
struct Connection final : jsi::NativeState {
  // Held by every call on the connection, its close and the teardown.
  std::recursive_mutex mutex;
  // nullptr once closed.
  evolu_database *database = nullptr;
  // How many closes it took, each finalizing every statement, also when
  // SQLite then refused to close it.
  int closes = 0;
};

// A statement handle's state.
struct Statement final : jsi::NativeState {
  explicit Statement(std::shared_ptr<Connection> connection)
      : connection(std::move(connection)), closes(this->connection->closes) {}

  const std::shared_ptr<Connection> connection;
  // Its connection's closes when it was prepared; a later close finalized it.
  const int closes;
  // nullptr once finalized, and finalized by its database's close too.
  sqlite3_stmt *stmt = nullptr;
  int parameterCount = 0;
  // Whether the last step returned a row.
  bool hasRow = false;
  // The column names of the preparation that reprepares counts, once read.
  bool hasNames = false;
  int reprepares = 0;
  std::vector<std::string> names;
};

bool isLive(const Statement &statement) {
  return statement.stmt != nullptr &&
         statement.connection->database != nullptr &&
         statement.closes == statement.connection->closes;
}

} // namespace

class RuntimeConnections {
public:
  std::mutex mutex;
  bool isTornDown = false;
  // The connections still open, which a close removes itself from.
  std::vector<std::shared_ptr<Connection>> open;
};

namespace {

[[noreturn]] void throwTypeError(jsi::Runtime &rt, const std::string &message) {
  throw jsi::JSError::createTypeError(rt, message);
}

[[noreturn]] void throwError(jsi::Runtime &rt, const std::string &message) {
  throw jsi::JSError(message, rt,
                     rt.createError(jsi::String::createFromUtf8(rt, message)));
}

// Throws an Error with the cause, as `new Error(message, { cause })` creates
// it.
[[noreturn]] void throwWithCause(jsi::Runtime &rt, const std::string &message,
                                 const jsi::Value &cause) {
  jsi::Object options(rt);
  options.setProperty(rt, "cause", cause);
  jsi::Value error =
      rt.global()
          .getPropertyAsFunction(rt, "Error")
          .callAsConstructor(rt, jsi::String::createFromUtf8(rt, message),
                             options);
  throw jsi::JSError(message, rt, std::move(error));
}

jsi::Object createTyped(jsi::Runtime &rt, const char *type) {
  jsi::Object object(rt);
  object.setProperty(rt, "type", type);
  return object;
}

// @evolu/common's NativeSqliteCodecFailure, or null for none.
jsi::Value createCodecFailure(jsi::Runtime &rt,
                              const evolu_database_codec_failure &failure) {
  const char *type;
  switch (failure.type) {
  case EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION:
    type = "SqlitePageAuthenticationError";
    break;
  case EVOLU_DATABASE_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED:
    type = "SqliteEncryptionUnsupported";
    break;
  case EVOLU_DATABASE_CODEC_FAILURE_RANDOM:
    type = "SqliteRandomSourceError";
    break;
  default:
    return jsi::Value::null();
  }
  jsi::Object error = createTyped(rt, type);
  if (failure.type == EVOLU_DATABASE_CODEC_FAILURE_PAGE_AUTHENTICATION)
    error.setProperty(rt, "pageNumber",
                      static_cast<double>(failure.page_number));
  jsi::Object codecFailure = createTyped(rt, "SqliteCodecFailure");
  codecFailure.setProperty(rt, "error", error);
  return codecFailure;
}

// The length of the well-formed UTF-8 sequence that starts bytes, which holds
// size bytes, or minus the length of the maximal subpart of an ill-formed one,
// which a decoder replaces with U+FFFD, as the WHATWG encoding standard reads
// UTF-8.
int sequenceLength(const uint8_t *bytes, size_t size) {
  const uint8_t lead = bytes[0];
  if (lead < 0x80) return 1;
  int needed;
  uint8_t lower = 0x80;
  uint8_t upper = 0xbf;
  if (lead >= 0xc2 && lead <= 0xdf)
    needed = 1;
  else if (lead >= 0xe0 && lead <= 0xef) {
    needed = 2;
    if (lead == 0xe0)
      lower = 0xa0;
    else if (lead == 0xed)
      upper = 0x9f;
  } else if (lead >= 0xf0 && lead <= 0xf4) {
    needed = 3;
    if (lead == 0xf0)
      lower = 0x90;
    else if (lead == 0xf4)
      upper = 0x8f;
  } else
    return -1;
  int length = 1;
  while (length <= needed && static_cast<size_t>(length) < size &&
         bytes[length] >= lower && bytes[length] <= upper) {
    length++;
    lower = 0x80;
    upper = 0xbf;
  }
  return length > needed ? length : -length;
}

// The bytes with U+FFFD in place of each ill-formed UTF-8 sequence, since
// Hermes would end a string at the first.
std::string wellFormed(const char *bytes, size_t size) {
  const auto *data = reinterpret_cast<const uint8_t *>(bytes);
  std::string text;
  text.reserve(size);
  for (size_t offset = 0; offset < size;) {
    const int length = sequenceLength(data + offset, size - offset);
    if (length > 0)
      text.append(bytes + offset, static_cast<size_t>(length));
    else
      text.append("\xef\xbf\xbd");
    offset += static_cast<size_t>(length > 0 ? length : -length);
  }
  return text;
}

// The string of TEXT's bytes, which only TEXT that isn't UTF-8 copies.
jsi::String createText(jsi::Runtime &rt, const uint8_t *bytes, size_t size) {
  size_t offset = 0;
  int length = 1;
  while (offset < size && length > 0) {
    length = sequenceLength(bytes + offset, size - offset);
    if (length > 0) offset += static_cast<size_t>(length);
  }
  if (offset == size) return jsi::String::createFromUtf8(rt, bytes, size);
  return jsi::String::createFromUtf8(
      rt, wellFormed(reinterpret_cast<const char *>(bytes), size));
}

// Throws the error a record describes, from the binding function operation
// names, and clears the record: a TypeError for an invalid path, and otherwise
// an Error with the record's message and a cause.
[[noreturn]] void throwRecord(jsi::Runtime &rt, const char *operation,
                              evolu_database_error &record) {
  const evolu_database_error copy = record;
  // SQLite's message may quote names that aren't UTF-8.
  const std::string message =
      wellFormed(record.message, std::strlen(record.message));
  evolu_database_clear_error(&record);
  switch (copy.type) {
  case EVOLU_DATABASE_ERROR_INVALID_PATH:
    throwTypeError(rt, message);
  case EVOLU_DATABASE_ERROR_FILE_HELD:
    throwWithCause(rt, message, createTyped(rt, "DatabaseFileHeldError"));
  case EVOLU_DATABASE_ERROR_EMPTY_SQL:
    throwWithCause(rt, message, createTyped(rt, "SqliteEmptySqlError"));
  case EVOLU_DATABASE_ERROR_MULTIPLE_STATEMENTS:
    throwWithCause(rt, message,
                   createTyped(rt, "SqliteMultipleStatementsError"));
  case EVOLU_DATABASE_ERROR_INVALID_SQL_TEXT:
    throwWithCause(rt, message, createTyped(rt, "SqliteInvalidSqlText"));
  default: {
    jsi::Object cause = createTyped(rt, "SqliteError");
    cause.setProperty(rt, "operation", operation);
    cause.setProperty(rt, "extendedCode", copy.code);
    cause.setProperty(rt, "message", jsi::String::createFromUtf8(rt, message));
    cause.setProperty(rt, "sqlOffset",
                      copy.sql_offset < 0 ? jsi::Value::null()
                                          : jsi::Value(copy.sql_offset));
    cause.setProperty(rt, "systemErrno",
                      copy.system_errno == 0 ? jsi::Value::null()
                                             : jsi::Value(copy.system_errno));
    cause.setProperty(rt, "cause", createCodecFailure(rt, copy.codec_failure));
    throwWithCause(rt, message, std::move(cause));
  }
  }
}

// Throws the error of a call on db that returned code.
[[noreturn]] void throwSqlite(jsi::Runtime &rt, const char *operation,
                              sqlite3 *db, int code) {
  evolu_database_error record;
  evolu_database_set_error(&record, db, code);
  throwRecord(rt, operation, record);
}

// Throws an error the binding found itself, with a message of its own.
[[noreturn]] void throwOwn(jsi::Runtime &rt, const char *operation,
                           evolu_database_error_type type, int code,
                           const char *message) {
  evolu_database_error record = {
      type,    code, message, -1, 0, {EVOLU_DATABASE_CODEC_FAILURE_NONE, 0},
      nullptr};
  throwRecord(rt, operation, record);
}

// The handle `this` is, or a TypeError naming what was expected.
template <typename State>
std::shared_ptr<State> getThis(jsi::Runtime &rt, const jsi::Value &thisValue,
                               const char *expected) {
  if (thisValue.isObject()) {
    jsi::Object object = thisValue.getObject(rt);
    if (object.hasNativeState<State>(rt))
      return object.getNativeState<State>(rt);
  }
  throwTypeError(rt, expected);
}

void requireOpen(jsi::Runtime &rt, const Connection &connection) {
  if (connection.database == nullptr) throwError(rt, "The database is closed.");
}

void requireLive(jsi::Runtime &rt, const Statement &statement) {
  if (!isLive(statement)) throwError(rt, "The statement is finalized.");
}

// The string a value is as UTF-8, or a TypeError with message.
std::string getUtf8(jsi::Runtime &rt, const jsi::Value &value,
                    const char *message) {
  if (!value.isString()) throwTypeError(rt, message);
  return value.getString(rt).utf8(rt);
}

bool isUint8Array(jsi::Runtime &rt, const jsi::Value &value) {
  return value.isObject() && value.getObject(rt).isUint8Array(rt);
}

struct Bytes {
  uint8_t *data;
  size_t size;
};

// The bytes of a Uint8Array's view, which a caller takes right before C reads
// or writes them, with no JSI call in between.
Bytes getBytes(jsi::Runtime &rt, jsi::Uint8Array &array) {
  const size_t size = array.byteLength(rt);
  if (size == 0) return {nullptr, 0};
  return {array.buffer(rt).data(rt) + array.byteOffset(rt), size};
}

Bytes getBytes(jsi::Runtime &rt, const jsi::Value &value) {
  jsi::Uint8Array array = value.getObject(rt).getUint8Array(rt);
  return getBytes(rt, array);
}

// A host function's argument, undefined when it wasn't given.
const jsi::Value &argument(const jsi::Value *args, size_t count,
                           size_t index) {
  // Undefined belongs to no runtime.
  static const jsi::Value undefined;
  return index < count ? args[index] : undefined;
}

void requireBytes(jsi::Runtime &rt, const jsi::Value &value, size_t size,
                  const char *message) {
  if (!isUint8Array(rt, value) ||
      value.getObject(rt).getUint8Array(rt).byteLength(rt) != size)
    throwTypeError(rt, message);
}

// Closes a connection unless it's closed, which releases its file, unless
// SQLite can't close it, and takes it off the runtime's connections.
void closeConnection(RuntimeConnections &connections, Connection &connection) {
  if (connection.database == nullptr) return;
  // The close finalizes every statement, also when SQLite then refuses it.
  connection.closes++;
  if (evolu_database_close(connection.database) != SQLITE_OK) return;
  connection.database = nullptr;
  std::lock_guard lock(connections.mutex);
  std::erase_if(connections.open, [&](const std::shared_ptr<Connection> &open) {
    return open.get() == &connection;
  });
}

// Reads the statement's column names unless it has them for its current
// preparation, which a schema change replaces.
void readColumnNames(Statement &statement) {
  const int reprepares =
      sqlite3_stmt_status(statement.stmt, SQLITE_STMTSTATUS_REPREPARE, 0);
  if (statement.hasNames && reprepares == statement.reprepares) return;
  std::vector<std::string> names;
  const int count = sqlite3_column_count(statement.stmt);
  // Never NULL: a prepare sets each name NUL-terminated, failing when it can't
  // (sqlite3VdbeSetColName), so reading it converts and allocates nothing. Only
  // a pragma that a VFS answers could set none, which neither the codec's nor
  // the unix and memory VFSes do.
  for (int i = 0; i < count; i++) {
    const char *name = sqlite3_column_name(statement.stmt, i);
    names.push_back(wellFormed(name, std::strlen(name)));
  }
  statement.names = std::move(names);
  statement.reprepares = reprepares;
  statement.hasNames = true;
}

// The property names of the statement's columns, for the rows of one call.
std::vector<jsi::PropNameID> createKeys(jsi::Runtime &rt,
                                        Statement &statement) {
  readColumnNames(statement);
  std::vector<jsi::PropNameID> keys;
  keys.reserve(statement.names.size());
  for (const std::string &name : statement.names)
    keys.push_back(jsi::PropNameID::forUtf8(
        rt, reinterpret_cast<const uint8_t *>(name.data()), name.size()));
  return keys;
}

// The row of the statement's last step.
jsi::Object createRow(jsi::Runtime &rt, Statement &statement,
                      const std::vector<jsi::PropNameID> &keys) {
  sqlite3_stmt *stmt = statement.stmt;
  sqlite3 *db = sqlite3_db_handle(stmt);
  jsi::Object row = jsi::Object::create(rt, jsi::Value::null());
  for (int i = 0; i < static_cast<int>(keys.size()); i++) {
    jsi::Value value;
    // The type first, so a NULL pointer is SQLITE_NOMEM, never SQL NULL.
    switch (sqlite3_column_type(stmt, i)) {
    case SQLITE_INTEGER:
    case SQLITE_FLOAT:
      value = sqlite3_column_double(stmt, i);
      break;
    case SQLITE_TEXT: {
      // The pointer first, then the length of the text it points to.
      const unsigned char *text = sqlite3_column_text(stmt, i);
      if (text == nullptr) throwSqlite(rt, "step", db, SQLITE_NOMEM);
      value = createText(rt, text,
                         static_cast<size_t>(sqlite3_column_bytes(stmt, i)));
      break;
    }
    case SQLITE_BLOB: {
      // NULL only when empty: with sqlite_config.h's SQLITE_OMIT_INCRBLOB,
      // SQLite fills a zeroblob when it creates it, so it never expands one
      // here, which could fail.
      const void *blob = sqlite3_column_blob(stmt, i);
      const size_t size = static_cast<size_t>(sqlite3_column_bytes(stmt, i));
      jsi::Uint8Array array(rt, size);
      if (size > 0) std::memcpy(getBytes(rt, array).data, blob, size);
      value = std::move(array);
      break;
    }
    default:
      value = jsi::Value::null();
      break;
    }
    row.setProperty(rt, keys[static_cast<size_t>(i)], std::move(value));
  }
  return row;
}

[[noreturn]] void throwParameterCount(jsi::Runtime &rt, int expected,
                                      size_t count) {
  throwTypeError(rt, "Expected " + std::to_string(expected) +
                         " parameters, got " + std::to_string(count) + ".");
}

// Reads the parameters, an array of count, each with an ordinary get, as
// Node-API does. With expected at 0 or more, an array of another length throws
// a TypeError before an element is read. An array longer than limit, more
// parameters than any statement has, returns no value, for the caller's check
// of the count to refuse, so a huge sparse array costs nothing.
std::vector<jsi::Value> readValues(jsi::Runtime &rt,
                                   const jsi::Value &parameters, int expected,
                                   size_t limit, size_t &count) {
  if (!parameters.isObject() || !parameters.getObject(rt).isArray(rt))
    throwTypeError(rt, "The parameters must be an array.");
  jsi::Array array = parameters.getObject(rt).getArray(rt);
  count = array.size(rt);
  if (expected >= 0 && count != static_cast<size_t>(expected))
    throwParameterCount(rt, expected, count);
  std::vector<jsi::Value> values;
  if (count > limit) return values;
  values.reserve(count);
  for (size_t i = 0; i < count; i++)
    values.push_back(array.getProperty(rt, jsi::Value(static_cast<double>(i))));
  return values;
}

// Reads the parameters, an array of exactly the statement's number of them,
// checking the statement again, since reading them can run JavaScript.
std::vector<jsi::Value> readParameters(jsi::Runtime &rt, Statement &statement,
                                       const jsi::Value &parameters) {
  size_t count = 0;
  std::vector<jsi::Value> values =
      readValues(rt, parameters, statement.parameterCount,
                 static_cast<size_t>(statement.parameterCount), count);
  requireLive(rt, statement);
  return values;
}

// Binds a value, returning SQLite's result, or throws a TypeError for a value
// that isn't a parameter. It sets isLarge for a text or blob over
// maxKeptValue.
int bindValue(jsi::Runtime &rt, sqlite3_stmt *stmt, int index,
              const jsi::Value &value, bool &isLarge) {
  if (value.isNull()) return sqlite3_bind_null(stmt, index);
  if (value.isNumber() && std::isfinite(value.getNumber())) {
    const double number = value.getNumber();
    // Number.isSafeInteger: the range check comes first, so the cast is
    // defined.
    if (number >= -maxSafeInteger && number <= maxSafeInteger &&
        static_cast<double>(static_cast<sqlite3_int64>(number)) == number)
      return sqlite3_bind_int64(stmt, index,
                                static_cast<sqlite3_int64>(number));
    return sqlite3_bind_double(stmt, index, number);
  }
  if (value.isString()) {
    const std::string text = value.getString(rt).utf8(rt);
    if (text.size() > maxKeptValue) isLarge = true;
    return sqlite3_bind_text64(stmt, index, text.data(), text.size(),
                               SQLITE_TRANSIENT, SQLITE_UTF8);
  }
  if (isUint8Array(rt, value)) {
    const Bytes bytes = getBytes(rt, value);
    if (bytes.size > maxKeptValue) isLarge = true;
    // A NULL pointer would bind NULL, not an empty blob.
    static const uint8_t empty = 0;
    return sqlite3_bind_blob64(stmt, index,
                               bytes.data != nullptr ? bytes.data : &empty,
                               bytes.size, SQLITE_TRANSIENT);
  }
  throwTypeError(rt, "A parameter must be null, a finite number, a string or "
                     "a Uint8Array.");
}

// Binds the values, setting hasLarge when it bound a text or blob over
// maxKeptValue, also when a later one throws.
void bindValues(jsi::Runtime &rt, Statement &statement,
                const std::vector<jsi::Value> &values, bool &hasLarge) {
  sqlite3_stmt *stmt = statement.stmt;
  evolu_database_discard_failure(sqlite3_db_handle(stmt));
  for (size_t i = 0; i < values.size(); i++) {
    const int rc =
        bindValue(rt, stmt, static_cast<int>(i) + 1, values[i], hasLarge);
    if (rc != SQLITE_OK) throwSqlite(rt, "bind", sqlite3_db_handle(stmt), rc);
  }
}

void resetStatement(Statement &statement) {
  sqlite3_reset(statement.stmt);
  statement.hasRow = false;
}

// The rows a run of stmt changed, from the total changes before it. SQLite
// keeps the count of the last INSERT, UPDATE or DELETE across other
// statements, and a statement that can't write changes no rows itself.
sqlite3_int64 changesOf(sqlite3_stmt *stmt, sqlite3_int64 totalChanges) {
  sqlite3 *db = sqlite3_db_handle(stmt);
  return sqlite3_total_changes64(db) == totalChanges ||
                 sqlite3_stmt_readonly(stmt)
             ? 0
             : sqlite3_changes64(db);
}

// What a run returns: its changes when it returned no row, its rows when it
// changed none, and { rows, changes } otherwise. Appending a row is an
// ordinary set, which can run a setter of Array.prototype, so with a
// statement, it checks the statement after each.
jsi::Value createResult(jsi::Runtime &rt, std::vector<jsi::Value> &rowValues,
                        sqlite3_int64 changes, const Statement *statement) {
  if (rowValues.empty()) return static_cast<double>(changes);
  jsi::Array rows(rt, 0);
  for (size_t i = 0; i < rowValues.size(); i++) {
    rows.setProperty(rt, jsi::Value(static_cast<double>(i)),
                     std::move(rowValues[i]));
    if (statement != nullptr) requireLive(rt, *statement);
  }
  if (changes == 0) return rows;
  jsi::Object result(rt);
  result.setProperty(rt, "rows", rows);
  result.setProperty(rt, "changes", static_cast<double>(changes));
  return result;
}

// Binds, steps to the end and resets, also when it fails, and only then
// appends the rows, each with an ordinary set, as Node-API does. A set can run
// JavaScript, so the statement is checked after each and reset again after
// the last, in case a setter stepped it, unless a setter closed it. SQLite
// keeps a copy of each bound value until it's bound again, so a run that bound
// a large one clears the bindings after its first reset, also when it fails.
jsi::Value run(jsi::Runtime &rt, Statement &statement,
               const jsi::Value &parameters) {
  sqlite3_stmt *stmt = statement.stmt;
  sqlite3 *db = sqlite3_db_handle(stmt);
  std::vector<jsi::Value> rowValues;
  sqlite3_int64 totalChanges = 0;
  int rc = SQLITE_OK;
  bool hasLarge = false;
  try {
    bindValues(rt, statement, readParameters(rt, statement, parameters),
               hasLarge);
    totalChanges = sqlite3_total_changes64(db);
    std::vector<jsi::PropNameID> keys;
    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
      statement.hasRow = true;
      if (rowValues.empty()) keys = createKeys(rt, statement);
      rowValues.emplace_back(createRow(rt, statement, keys));
    }
  } catch (...) {
    if (isLive(statement)) {
      resetStatement(statement);
      if (hasLarge) sqlite3_clear_bindings(statement.stmt);
    }
    throw;
  }
  // A failed step's error, read before the reset repeats it.
  evolu_database_error record;
  if (rc != SQLITE_DONE) evolu_database_set_error(&record, db, rc);
  resetStatement(statement);
  if (hasLarge) sqlite3_clear_bindings(stmt);
  if (rc != SQLITE_DONE) throwRecord(rt, "step", record);
  jsi::Value result;
  try {
    result =
        createResult(rt, rowValues, changesOf(stmt, totalChanges), &statement);
  } catch (...) {
    // A setter that threw could have stepped it, and its error propagates.
    if (isLive(statement)) resetStatement(statement);
    throw;
  }
  // A setter of the result's rows or changes, which a run that both returned
  // rows and changed some sets after its rows, can close the database.
  if (isLive(statement)) resetStatement(statement);
  return result;
}

jsi::Value step(jsi::Runtime &rt, Statement &statement) {
  sqlite3 *db = sqlite3_db_handle(statement.stmt);
  evolu_database_discard_failure(db);
  const int rc = sqlite3_step(statement.stmt);
  statement.hasRow = rc == SQLITE_ROW;
  if (rc == SQLITE_ROW)
    return createRow(rt, statement, createKeys(rt, statement));
  if (rc != SQLITE_DONE) throwSqlite(rt, "step", db, rc);
  return jsi::Value::null();
}

// Completing a statement whose last step returned a row can fail, as a commit;
// otherwise the code only repeats a failed step's error, or is SQLITE_OK after
// SQLITE_DONE.
void complete(jsi::Runtime &rt, Statement &statement, bool isFinalize) {
  const bool hadRow = statement.hasRow;
  statement.hasRow = false;
  sqlite3 *db = sqlite3_db_handle(statement.stmt);
  evolu_database_discard_failure(db);
  const int rc = isFinalize ? sqlite3_finalize(statement.stmt)
                            : sqlite3_reset(statement.stmt);
  if (isFinalize) {
    statement.stmt = nullptr;
    statement.names.clear();
  }
  if (rc != SQLITE_OK && hadRow) throwSqlite(rt, "step", db, rc);
}

bool hasLoneSurrogate(const std::u16string &text) {
  for (size_t i = 0; i < text.size(); i++) {
    const bool isHigh = text[i] >= 0xd800 && text[i] <= 0xdbff;
    const bool isLow = text[i] >= 0xdc00 && text[i] <= 0xdfff;
    if (isHigh && i + 1 < text.size() && text[i + 1] >= 0xdc00 &&
        text[i + 1] <= 0xdfff)
      i++;
    else if (isHigh || isLow)
      return true;
  }
  return false;
}

// The SQL as UTF-8, or a TypeError for a value that isn't a string, or an
// error for a lone surrogate.
std::string getSql(jsi::Runtime &rt, const jsi::Value &sql) {
  std::string text = getUtf8(rt, sql, "The SQL must be a string.");
  if (hasLoneSurrogate(sql.getString(rt).utf16(rt)))
    throwOwn(rt, "prepare", EVOLU_DATABASE_ERROR_INVALID_SQL_TEXT,
             SQLITE_MISUSE, "The SQL contains a lone surrogate.");
  return text;
}

jsi::Value prepare(jsi::Runtime &rt, const jsi::Value &thisValue,
                   const jsi::Value &sql) {
  std::shared_ptr<Connection> connection =
      getThis<Connection>(rt, thisValue, "Expected a database.");
  // Reading the prototype could run a getter, before the database is checked.
  jsi::Object handle = jsi::Object::create(
      rt, thisValue.getObject(rt).getProperty(rt, "statementPrototype"));
  std::lock_guard lock(connection->mutex);
  requireOpen(rt, *connection);
  const std::string text = getSql(rt, sql);
  auto statement = std::make_shared<Statement>(connection);
  evolu_database_error record;
  if (evolu_database_prepare(connection->database, text.data(), text.size(),
                             &statement->stmt, &record) != SQLITE_OK)
    throwRecord(rt, "prepare", record);
  statement->parameterCount = sqlite3_bind_parameter_count(statement->stmt);
  handle.setNativeState(rt, std::move(statement));
  return handle;
}

// Prepares, binds, steps and finalizes one statement, with no handle of its
// own. It reads the parameters before it prepares, since reading them can run
// JavaScript that closes the database, and appends the rows after the
// finalize.
jsi::Value runOnce(jsi::Runtime &rt, const jsi::Value &thisValue,
                   const jsi::Value &sql, const jsi::Value &parameters) {
  std::shared_ptr<Connection> connection =
      getThis<Connection>(rt, thisValue, "Expected a database.");
  std::lock_guard lock(connection->mutex);
  requireOpen(rt, *connection);
  const std::string text = getSql(rt, sql);
  size_t count = 0;
  // No JavaScript has run, so the database is open.
  const std::vector<jsi::Value> values = readValues(
      rt, parameters, -1,
      static_cast<size_t>(
          sqlite3_limit(evolu_database_connection(connection->database),
                        SQLITE_LIMIT_VARIABLE_NUMBER, -1)),
      count);
  requireOpen(rt, *connection);
  Statement statement(connection);
  evolu_database_error record;
  if (evolu_database_prepare(connection->database, text.data(), text.size(),
                             &statement.stmt, &record) != SQLITE_OK)
    throwRecord(rt, "prepare", record);
  sqlite3_stmt *stmt = statement.stmt;
  sqlite3 *db = sqlite3_db_handle(stmt);
  const sqlite3_int64 totalChanges = sqlite3_total_changes64(db);
  std::vector<jsi::Value> rowValues;
  int rc = SQLITE_OK;
  try {
    const int parameterCount = sqlite3_bind_parameter_count(stmt);
    if (count != static_cast<size_t>(parameterCount))
      throwParameterCount(rt, parameterCount, count);
    bool hasLarge = false;
    bindValues(rt, statement, values, hasLarge);
    std::vector<jsi::PropNameID> keys;
    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
      if (rowValues.empty()) keys = createKeys(rt, statement);
      rowValues.emplace_back(createRow(rt, statement, keys));
    }
  } catch (...) {
    // Creating the error can run JavaScript, such as a getter of its stack or
    // a setter of Object.prototype, which can close the database, finalizing
    // the statement.
    if (isLive(statement)) sqlite3_finalize(stmt);
    throw;
  }
  // A failed step's error, read before the finalize repeats it.
  if (rc != SQLITE_DONE) evolu_database_set_error(&record, db, rc);
  const sqlite3_int64 changes = changesOf(stmt, totalChanges);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) throwRecord(rt, "step", record);
  return createResult(rt, rowValues, changes, nullptr);
}

// The bytes of an export, which its external ArrayBuffer holds: they came from
// evolu_database_export, and the destructor wipes and frees them.
class ExportBuffer final : public jsi::MutableBuffer {
public:
  ExportBuffer(uint8_t *bytes, size_t size) : bytes_(bytes), size_(size) {}
  ~ExportBuffer() override { evolu_database_free_export(bytes_, size_); }
  ExportBuffer(const ExportBuffer &) = delete;
  ExportBuffer &operator=(const ExportBuffer &) = delete;

  size_t size() const override { return size_; }
  uint8_t *data() override { return bytes_; }

private:
  uint8_t *bytes_;
  size_t size_;
};

jsi::Value exportDatabase(jsi::Runtime &rt, Connection &connection) {
  uint8_t *bytes;
  size_t size;
  evolu_database_error record;
  if (evolu_database_export(connection.database, &bytes, &size, &record) !=
      SQLITE_OK)
    throwRecord(rt, "export", record);
  jsi::ArrayBuffer buffer(rt, std::make_shared<ExportBuffer>(bytes, size));
  buffer.setExternalMemoryPressure(rt, size);
  return buffer;
}

// Opens a database for the runtime and returns its handle, created with the
// database prototype `this` is bound to.
template <typename Open>
jsi::Value openDatabase(jsi::Runtime &rt, const jsi::Value &thisValue,
                        RuntimeConnections &connections, Open open) {
  jsi::Object handle = jsi::Object::create(rt, thisValue);
  auto connection = std::make_shared<Connection>();
  evolu_database_error record;
  bool isTornDown;
  int rc = SQLITE_OK;
  {
    // Held through the open, so a teardown waits for it.
    std::lock_guard lock(connections.mutex);
    isTornDown = connections.isTornDown;
    if (!isTornDown) rc = open(&connection->database, &record);
    if (rc == SQLITE_OK && !isTornDown) connections.open.push_back(connection);
  }
  if (isTornDown) throwError(rt, "The native module was torn down.");
  if (rc != SQLITE_OK) throwRecord(rt, "open", record);
  handle.setNativeState(rt, std::move(connection));
  return handle;
}

// Validates an XChaCha20-Poly1305 call's key, nonce and input.
void requireXChaChaArguments(jsi::Runtime &rt, const jsi::Value *args,
                             size_t count) {
  requireBytes(rt, argument(args, count, 0), EVOLU_XCHACHA_KEY_SIZE,
               "The key must be a Uint8Array of 32 bytes.");
  requireBytes(rt, argument(args, count, 1), EVOLU_XCHACHA_NONCE_SIZE,
               "The nonce must be a Uint8Array of 24 bytes.");
  if (!isUint8Array(rt, argument(args, count, 2)))
    throwTypeError(rt, "The input must be a Uint8Array.");
}

jsi::Function createFunction(jsi::Runtime &rt, const char *name,
                             unsigned parameters,
                             jsi::HostFunctionType function) {
  return jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, name), parameters, std::move(function));
}

} // namespace

std::shared_ptr<RuntimeConnections> createRuntimeConnections() {
  return std::make_shared<RuntimeConnections>();
}

void teardownRuntimeConnections(RuntimeConnections &connections) {
  std::vector<std::shared_ptr<Connection>> open;
  {
    std::lock_guard lock(connections.mutex);
    connections.isTornDown = true;
    open.swap(connections.open);
  }
  for (const std::shared_ptr<Connection> &connection : open) {
    std::lock_guard lock(connection->mutex);
    closeConnection(connections, *connection);
  }
}

jsi::Object
createBinding(jsi::Runtime &rt,
              const std::shared_ptr<RuntimeConnections> &connections) {
  evolu_database_error record;
  if (evolu_database_check_build(&record) != SQLITE_OK) {
    const std::string message = record.message;
    evolu_database_clear_error(&record);
    throw jsi::JSError(rt, message);
  }
  // Methods and the statement prototype are unenumerable, as a class's.
  jsi::Function defineProperty =
      rt.global().getPropertyAsObject(rt, "Object").getPropertyAsFunction(
          rt, "defineProperty");
  auto define = [&](const jsi::Object &object, const char *name,
                    const jsi::Value &value) {
    jsi::Object descriptor(rt);
    descriptor.setProperty(rt, "value", value);
    descriptor.setProperty(rt, "writable", true);
    descriptor.setProperty(rt, "configurable", true);
    defineProperty.call(rt, object, name, descriptor);
  };
  auto defineStatementMethod = [&](const jsi::Object &prototype,
                                   const char *name, unsigned parameters,
                                   auto method) {
    define(prototype, name,
           createFunction(
               rt, name, parameters,
               [method](jsi::Runtime &rt, const jsi::Value &thisValue,
                        const jsi::Value *args, size_t count) -> jsi::Value {
                 std::shared_ptr<Statement> statement =
                     getThis<Statement>(rt, thisValue, "Expected a statement.");
                 std::lock_guard lock(statement->connection->mutex);
                 requireLive(rt, *statement);
                 return method(rt, *statement, argument(args, count, 0));
               }));
  };

  jsi::Object statementPrototype(rt);
  defineStatementMethod(statementPrototype, "run", 1,
                        [](jsi::Runtime &rt, Statement &statement,
                           const jsi::Value &parameters) {
                          return run(rt, statement, parameters);
                        });
  defineStatementMethod(
      statementPrototype, "bind", 1,
      [](jsi::Runtime &rt, Statement &statement, const jsi::Value &parameters) {
        // The steps that follow need the values, however large.
        bool hasLarge = false;
        bindValues(rt, statement, readParameters(rt, statement, parameters),
                   hasLarge);
        return jsi::Value::undefined();
      });
  defineStatementMethod(
      statementPrototype, "step", 0,
      [](jsi::Runtime &rt, Statement &statement, const jsi::Value &) {
        return step(rt, statement);
      });
  defineStatementMethod(
      statementPrototype, "reset", 0,
      [](jsi::Runtime &rt, Statement &statement, const jsi::Value &) {
        complete(rt, statement, false);
        return jsi::Value::undefined();
      });
  defineStatementMethod(
      statementPrototype, "finalize", 0,
      [](jsi::Runtime &rt, Statement &statement, const jsi::Value &) {
        complete(rt, statement, true);
        return jsi::Value::undefined();
      });

  jsi::Object databasePrototype(rt);
  define(databasePrototype, "prepare",
         createFunction(rt, "prepare", 1,
                        [](jsi::Runtime &rt, const jsi::Value &thisValue,
                           const jsi::Value *args, size_t count) {
                          return prepare(rt, thisValue,
                                         argument(args, count, 0));
                        }));
  define(databasePrototype, "run",
         createFunction(rt, "run", 2,
                        [](jsi::Runtime &rt, const jsi::Value &thisValue,
                           const jsi::Value *args, size_t count) {
                          return runOnce(rt, thisValue,
                                         argument(args, count, 0),
                                         argument(args, count, 1));
                        }));
  define(databasePrototype, "export",
         createFunction(rt, "export", 0,
                        [](jsi::Runtime &rt, const jsi::Value &thisValue,
                           const jsi::Value *, size_t) {
                          std::shared_ptr<Connection> connection =
                              getThis<Connection>(rt, thisValue,
                                                  "Expected a database.");
                          std::lock_guard lock(connection->mutex);
                          requireOpen(rt, *connection);
                          return exportDatabase(rt, *connection);
                        }));
  // Never throws for an error SQLite reports: a connection SQLite can't close
  // stays open, holding its file, and a later close tries again.
  define(databasePrototype, "close",
         createFunction(rt, "close", 0,
                        [connections](jsi::Runtime &rt,
                                      const jsi::Value &thisValue,
                                      const jsi::Value *, size_t) {
                          std::shared_ptr<Connection> connection =
                              getThis<Connection>(rt, thisValue,
                                                  "Expected a database.");
                          std::lock_guard lock(connection->mutex);
                          closeConnection(*connections, *connection);
                          return jsi::Value::undefined();
                        }));
  {
    jsi::Object descriptor(rt);
    descriptor.setProperty(rt, "value", statementPrototype);
    defineProperty.call(rt, databasePrototype, "statementPrototype",
                        descriptor);
  }

  // The opens, bound to the database prototype, which they create handles
  // with.
  auto bound = [&](jsi::Function function) {
    return function.getPropertyAsFunction(rt, "bind")
        .callWithThis(rt, function, databasePrototype);
  };
  jsi::Object binding(rt);
  binding.setProperty(rt, "abiVersion", abiVersion);
  binding.setProperty(
      rt, "openMemory",
      bound(createFunction(
          rt, "openMemory", 0,
          [connections](jsi::Runtime &rt, const jsi::Value &thisValue,
                        const jsi::Value *, size_t) {
            return openDatabase(rt, thisValue, *connections,
                                [](evolu_database **database,
                                   evolu_database_error *record) {
                                  return evolu_database_open_memory(database,
                                                                    record);
                                });
          })));
  binding.setProperty(
      rt, "openFile",
      bound(createFunction(
          rt, "openFile", 1,
          [connections](jsi::Runtime &rt, const jsi::Value &thisValue,
                        const jsi::Value *args, size_t count) {
            const std::string path =
                getUtf8(rt, argument(args, count, 0),
                        "The path must be a string.");
            return openDatabase(rt, thisValue, *connections,
                                [&](evolu_database **database,
                                    evolu_database_error *record) {
                                  return evolu_database_open_file(
                                      path.data(), path.size(), database,
                                      record);
                                });
          })));
  // The path converts first, then the key is copied, with no JSI call in
  // between, and the copy is wiped once the codec has its own.
  binding.setProperty(
      rt, "openEncryptedFile",
      bound(createFunction(
          rt, "openEncryptedFile", 2,
          [connections](jsi::Runtime &rt, const jsi::Value &thisValue,
                        const jsi::Value *args, size_t count) {
            const std::string path =
                getUtf8(rt, argument(args, count, 0),
                        "The path must be a string.");
            const jsi::Value &key = argument(args, count, 1);
            requireBytes(rt, key, EVOLU_DATABASE_KEY_SIZE,
                         "The key must be a Uint8Array of 32 bytes.");
            return openDatabase(
                rt, thisValue, *connections,
                [&](evolu_database **database, evolu_database_error *record) {
                  uint8_t copy[EVOLU_DATABASE_KEY_SIZE];
                  std::memcpy(copy, getBytes(rt, key).data, sizeof copy);
                  const int rc = evolu_database_open_encrypted_file(
                      path.data(), path.size(), copy, database, record);
                  evolu_database_wipe(copy, sizeof copy);
                  return rc;
                });
          })));
  binding.setProperty(
      rt, "isFileOpen",
      createFunction(rt, "isFileOpen", 1,
                     [](jsi::Runtime &rt, const jsi::Value &,
                        const jsi::Value *args, size_t count) {
                       const std::string path = getUtf8(
                           rt, argument(args, count, 0),
                           "The path must be a string.");
                       int isOpen;
                       evolu_database_error record;
                       if (evolu_database_is_file_open(path.data(), path.size(),
                                                       &isOpen, &record) !=
                           SQLITE_OK)
                         throwRecord(rt, "isFileOpen", record);
                       return jsi::Value(isOpen != 0);
                     }));
  binding.setProperty(
      rt, "deleteFile",
      createFunction(rt, "deleteFile", 1,
                     [](jsi::Runtime &rt, const jsi::Value &,
                        const jsi::Value *args, size_t count) {
                       const std::string path = getUtf8(
                           rt, argument(args, count, 0),
                           "The path must be a string.");
                       evolu_database_error record;
                       if (evolu_database_delete_file(path.data(), path.size(),
                                                      &record) != SQLITE_OK)
                         throwRecord(rt, "deleteFile", record);
                       return jsi::Value::undefined();
                     }));
  binding.setProperty(
      rt, "fillRandom",
      createFunction(
          rt, "fillRandom", 1,
          [](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args,
             size_t count) {
            const jsi::Value &bytesValue = argument(args, count, 0);
            if (!isUint8Array(rt, bytesValue))
              throwTypeError(rt, "The bytes must be a Uint8Array.");
            const Bytes bytes = getBytes(rt, bytesValue);
            if (bytes.size > 0 &&
                evolu_database_random_bytes(bytes.data, bytes.size) !=
                    SQLITE_OK)
              throwError(rt, "The platform's random source failed.");
            return jsi::Value::undefined();
          }));
  // The output first, then the arguments' data, which C reads with no JSI call
  // in between.
  binding.setProperty(
      rt, "encryptXChaCha20Poly1305",
      createFunction(
          rt, "encryptXChaCha20Poly1305", 3,
          [](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args,
             size_t count) {
            requireXChaChaArguments(rt, args, count);
            const size_t size =
                argument(args, count, 2)
                    .getObject(rt)
                    .getUint8Array(rt)
                    .byteLength(rt);
            jsi::Uint8Array output(rt, size + EVOLU_XCHACHA_TAG_SIZE);
            uint8_t *outputBytes = getBytes(rt, output).data;
            const Bytes plaintext = getBytes(rt, argument(args, count, 2));
            const uint8_t *key = getBytes(rt, argument(args, count, 0)).data;
            const uint8_t *nonce = getBytes(rt, argument(args, count, 1)).data;
            evolu_xchacha_encrypt(outputBytes, key, nonce, plaintext.data,
                                  plaintext.size);
            return output;
          }));
  binding.setProperty(
      rt, "decryptXChaCha20Poly1305",
      createFunction(
          rt, "decryptXChaCha20Poly1305", 3,
          [](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args,
             size_t count) {
            requireXChaChaArguments(rt, args, count);
            const size_t size =
                argument(args, count, 2)
                    .getObject(rt)
                    .getUint8Array(rt)
                    .byteLength(rt);
            if (size < EVOLU_XCHACHA_TAG_SIZE)
              throwError(rt, "The ciphertext doesn't authenticate.");
            jsi::Uint8Array output(rt, size - EVOLU_XCHACHA_TAG_SIZE);
            uint8_t *outputBytes = getBytes(rt, output).data;
            const Bytes ciphertext = getBytes(rt, argument(args, count, 2));
            const uint8_t *key = getBytes(rt, argument(args, count, 0)).data;
            const uint8_t *nonce = getBytes(rt, argument(args, count, 1)).data;
            if (evolu_xchacha_decrypt(outputBytes, key, nonce, ciphertext.data,
                                      ciphertext.size) != EVOLU_XCHACHA_OK)
              throwError(rt, "The ciphertext doesn't authenticate.");
            return output;
          }));
  return binding;
}

} // namespace evolu
