/*
 * The Hermes host of the JSI adapter, cpp/EvoluSqliteBinding.cpp, which
 * scripts/hermes.mts builds with sanitizers and runs:
 *
 *     host <suite.js> <directory> [filter]
 *
 * suite.js is test/hermes/suite.ts compiled to one script. The host evaluates
 * it in a runtime with a binding and the hooks of suite.ts's HermesHost, runs
 * the tests it registers, then its own tests of runtimes, threads and the
 * export's buffer, each test whose name includes the filter, with its files
 * under directory. It prints a line per test and the failures, and exits with
 * 1 when a test failed.
 *
 * Its SQLite allocator, installed before SQLite initializes, is SQLite's own,
 * except that a test can make allocations fail or watch what's freed, and that
 * it counts the live allocations. After the tests, with the backups finished
 * and the auto extensions reset, the run fails unless none is left, since
 * LeakSanitizer doesn't run on Apple's arm64.
 */
#include "evolu_names.h"

#include "EvoluSqliteBinding.h"

#include "evolu_database.h"
#include "evolu_sqlite3.h"

#include <hermes/hermes.h>
#include <jsi/instrumentation.h>
#include <jsi/jsi.h>

#include <dirent.h>
#include <sys/stat.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <exception>
#include <filesystem>
#include <fstream>
#include <functional>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

// The crypto layer's test hook (src/evolu_crypto.h), which the host's build
// compiles: while it's set, the platform's random source fails.
extern "C" int evolu_test_random_fails;

namespace jsi = facebook::jsi;

namespace {

// --- SQLite's allocator ----------------------------------------------------

sqlite3_mem_methods defaultMethods;

// At -1, no allocation fails. From 0 up, each allocation takes one, and the
// one that finds 0 fails and leaves -2, where every later one fails too.
std::atomic<int> allocationsLeft{-1};

// What a test sees of each free, before it's made.
std::atomic<void (*)(void *, int)> freeHook{nullptr};

// The allocations not freed yet.
std::atomic<long> liveAllocations{0};

bool allocationFails() {
  int left = allocationsLeft.load();
  while (left >= 0)
    if (allocationsLeft.compare_exchange_weak(left, left > 0 ? left - 1 : -2))
      return left == 0;
  return left == -2;
}

void *testMalloc(int size) {
  void *p = allocationFails() ? nullptr : defaultMethods.xMalloc(size);
  if (p != nullptr) liveAllocations++;
  return p;
}

void *testRealloc(void *p, int size) {
  return allocationFails() ? nullptr : defaultMethods.xRealloc(p, size);
}

// SQLite never frees NULL through it, nor reallocates NULL.
void testFree(void *p) {
  if (auto hook = freeHook.load()) hook(p, defaultMethods.xSize(p));
  defaultMethods.xFree(p);
  liveAllocations--;
}

void installAllocator() {
  sqlite3_config(SQLITE_CONFIG_GETMALLOC, &defaultMethods);
  sqlite3_mem_methods methods = defaultMethods;
  methods.xMalloc = testMalloc;
  methods.xRealloc = testRealloc;
  methods.xFree = testFree;
  if (sqlite3_config(SQLITE_CONFIG_MALLOC, &methods) != SQLITE_OK)
    throw std::runtime_error("SQLite took no allocator.");
}

// --- Auto extensions -------------------------------------------------------

using AutoExtension = int (*)(sqlite3 *, char **,
                              const sqlite3_api_routines *);

// SQLite calls an auto extension with the connection, as a loaded
// extension's entry point, and takes it as a function of no arguments.
void (*entryPoint(AutoExtension extension))(void) {
  return reinterpret_cast<void (*)(void)>(extension);
}

void writeLog(sqlite3_context *context, int, sqlite3_value **) {
  int rc = sqlite3_exec(sqlite3_context_db_handle(context),
                        "insert into log values (1), (2)", nullptr, nullptr,
                        nullptr);
  if (rc != SQLITE_OK)
    sqlite3_result_error_code(context, rc);
  else
    sqlite3_result_null(context);
}

int registerWriteLog(sqlite3 *db, char **, const sqlite3_api_routines *) {
  return sqlite3_create_function_v2(db, "write_log", 0, SQLITE_UTF8, nullptr,
                                    writeLog, nullptr, nullptr, nullptr);
}

// The backups started from connections as they opened, each into a database
// of its own.
std::mutex backupsMutex;
std::vector<std::pair<sqlite3 *, sqlite3_backup *>> backups;
thread_local bool isOpeningCopy = false;

int startBackup(sqlite3 *db, char **, const sqlite3_api_routines *) {
  // The copy's own open runs the auto extensions too.
  if (isOpeningCopy) return SQLITE_OK;
  isOpeningCopy = true;
  sqlite3 *copy = nullptr;
  int rc = sqlite3_open(":memory:", &copy);
  isOpeningCopy = false;
  if (rc != SQLITE_OK) {
    sqlite3_close(copy);
    return rc;
  }
  std::lock_guard lock(backupsMutex);
  backups.emplace_back(copy, sqlite3_backup_init(copy, "main", db, "main"));
  return SQLITE_OK;
}

void finishBackups() {
  std::lock_guard lock(backupsMutex);
  for (auto [copy, backup] : backups) {
    sqlite3_backup_finish(backup);
    sqlite3_close(copy);
  }
  backups.clear();
}

// What a call blocked inside SQLite waits on until the test releases it.
struct {
  std::mutex mutex;
  std::condition_variable changed;
  bool isEntered = false;
  bool isReleased = false;
} gate;

void waitOnGate() {
  std::unique_lock lock(gate.mutex);
  gate.isEntered = true;
  gate.changed.notify_all();
  gate.changed.wait(lock, [] { return gate.isReleased; });
}

// block() waits inside its step.
void block(sqlite3_context *context, int, sqlite3_value **) {
  waitOnGate();
  sqlite3_result_int(context, 1);
}

int registerBlock(sqlite3 *db, char **, const sqlite3_api_routines *) {
  return sqlite3_create_function_v2(db, "block", 0, SQLITE_UTF8, nullptr,
                                    block, nullptr, nullptr, nullptr);
}

// Holds a connection's open.
int holdOpen(sqlite3 *, char **, const sqlite3_api_routines *) {
  waitOnGate();
  return SQLITE_OK;
}

// Set once a connection is open, so the hooks below wait on the gate in the
// call a test makes, once, and not while the connection opens.
std::atomic<bool> isGateArmed{false};

void noop(sqlite3_context *, int, sqlite3_value **) {}

// sqlite3_close destroys the function, which waits in close.
int holdClose(sqlite3 *db, char **, const sqlite3_api_routines *) {
  return sqlite3_create_function_v2(
      db, "held", 0, SQLITE_UTF8, nullptr, noop, nullptr, nullptr,
      [](void *) {
        if (isGateArmed.exchange(false)) waitOnGate();
      });
}

// Waits in prepare, which asks for the collation `block`.
int holdPrepare(sqlite3 *db, char **, const sqlite3_api_routines *) {
  return sqlite3_collation_needed(
      db, nullptr, [](void *, sqlite3 *db, int, const char *name) {
        if (std::strcmp(name, "block") != 0) return;
        if (isGateArmed.exchange(false)) waitOnGate();
        sqlite3_create_collation_v2(
            db, "block", SQLITE_UTF8, nullptr,
            [](void *, int leftSize, const void *left, int rightSize,
               const void *right) {
              const auto common =
                  static_cast<size_t>(std::min(leftSize, rightSize));
              const int order = std::memcmp(left, right, common);
              return order != 0 ? order : leftSize - rightSize;
            },
            nullptr);
      });
}

// Waits in export, at its first statement, which reads the page count.
int holdExport(sqlite3 *db, char **, const sqlite3_api_routines *) {
  return sqlite3_trace_v2(
      db, SQLITE_TRACE_STMT,
      [](unsigned, void *, void *, void *sql) {
        if (std::strstr(static_cast<const char *>(sql), "page_count") !=
                nullptr &&
            isGateArmed.exchange(false))
          waitOnGate();
        return 0;
      },
      nullptr);
}

// --- Helpers ---------------------------------------------------------------

void check(bool condition, const std::string &what) {
  if (!condition) throw std::runtime_error("Expected " + what + ".");
}

std::string readFile(const char *path) {
  std::ifstream input(path, std::ios::binary);
  std::stringstream contents;
  contents << input.rdbuf();
  return contents.str();
}

// Whether a connection of the process holds the file at path.
bool isHeld(const std::string &path) {
  int isOpen = 0;
  evolu_database_error error;
  check(evolu_database_is_file_open(path.data(), path.size(), &isOpen,
                                    &error) == SQLITE_OK,
        "isFileOpen to succeed");
  return isOpen != 0;
}

bool exists(const std::string &path) {
  struct stat status;
  return lstat(path.c_str(), &status) == 0;
}

// The process's open file descriptors, the directory's own among them.
int openFileDescriptors() {
  DIR *directory = opendir("/dev/fd");
  check(directory != nullptr, "/dev/fd to open");
  int count = 0;
  while (readdir(directory) != nullptr) count++;
  closedir(directory);
  return count;
}

jsi::Function hostFunction(jsi::Runtime &rt, const char *name,
                           jsi::HostFunctionType function) {
  return jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, name), 0, std::move(function));
}

// A runtime with a binding as `binding`, and the connections its module
// would own.
struct TestRuntime {
  std::shared_ptr<evolu::RuntimeConnections> connections =
      evolu::createRuntimeConnections();
  std::unique_ptr<facebook::hermes::HermesRuntime> runtime =
      facebook::hermes::makeHermesRuntime();

  TestRuntime() {
    rt().global().setProperty(rt(), "binding",
                              evolu::createBinding(rt(), connections));
  }

  jsi::Runtime &rt() { return *runtime; }

  jsi::Value eval(const std::string &code) {
    return rt().evaluateJavaScript(std::make_shared<jsi::StringBuffer>(code),
                                   "test.js");
  }

  // Evaluates code to a string, such as a JSON.stringify.
  std::string text(const std::string &code) {
    return eval(code).getString(rt()).utf8(rt());
  }

  // What the module's destructor does.
  void teardown() { evolu::teardownRuntimeConnections(*connections); }
};

// A JavaScript string literal of text.
std::string literal(const std::string &text) {
  return "\"" + text + "\"";
}

const char *keyJs = "Uint8Array.from({ length: 32 }, (_, i) => i + 7)";

// What JavaScript code throws, as {message, cause}, or "none".
std::string thrownBy(const std::string &code) {
  return "(() => { try { " + code +
         "; return 'none'; } catch (error) { return JSON.stringify({ "
         "message: error.message, cause: error.cause }); } })()";
}

struct Test {
  std::string name;
  std::function<void(const std::string &directory)> run;
};

// Opens the file at path in a runtime on another thread, with extension's
// hook, then runs call there, which the hook blocks on the gate inside SQLite,
// and meanwhile tears the runtime's connections down from a third thread. The
// teardown must wait for the call, which returns expected, and then release
// the file.
void raceTeardown(const std::string &path, AutoExtension extension,
                  const std::string &call, const std::string &expected,
                  const std::string &what) {
  std::shared_ptr<evolu::RuntimeConnections> connections;
  std::atomic<bool> hasReturned{false};
  std::string result;
  std::string failure;
  std::mutex mutex;
  std::condition_variable changed;
  bool isReady = false;
  bool isDone = false;
  {
    std::lock_guard lock(gate.mutex);
    gate.isEntered = false;
    gate.isReleased = false;
  }
  isGateArmed = false;
  std::thread runner([&] {
    try {
      TestRuntime runtime;
      sqlite3_auto_extension(entryPoint(extension));
      runtime.eval("globalThis.database = binding.openFile(" + literal(path) +
                   ")");
      sqlite3_cancel_auto_extension(entryPoint(extension));
      {
        std::lock_guard lock(mutex);
        connections = runtime.connections;
        isReady = true;
        changed.notify_all();
      }
      isGateArmed = true;
      result = runtime.text(call);
      std::unique_lock lock(mutex);
      changed.wait(lock, [&] { return isDone; });
    } catch (const std::exception &error) {
      {
        std::lock_guard lock(mutex);
        failure = error.what();
        changed.notify_all();
      }
      std::lock_guard lock(gate.mutex);
      gate.isEntered = true;
      gate.changed.notify_all();
    }
  });
  {
    std::unique_lock lock(gate.mutex);
    gate.changed.wait(lock, [] { return gate.isEntered; });
  }
  bool isRunning;
  {
    std::unique_lock lock(mutex);
    changed.wait(lock, [&] { return isReady || !failure.empty(); });
    isRunning = failure.empty();
  }
  std::thread tearer;
  if (isRunning)
    tearer = std::thread([&] {
      evolu::teardownRuntimeConnections(*connections);
      hasReturned = true;
    });
  std::this_thread::sleep_for(std::chrono::milliseconds(200));
  const bool returnedEarly = hasReturned;
  {
    std::lock_guard lock(gate.mutex);
    gate.isReleased = true;
    gate.changed.notify_all();
  }
  if (tearer.joinable()) tearer.join();
  const bool isHeldAfter = isHeld(path);
  {
    std::lock_guard lock(mutex);
    isDone = true;
    changed.notify_all();
  }
  runner.join();
  isGateArmed = false;
  check(failure.empty(), "no failure, not " + failure);
  check(!returnedEarly, "the teardown to wait for the " + what);
  check(result == expected, "the " + what + "'s result, not " + result);
  check(!isHeldAfter, "the file released after the teardown");
}

// --- The host's tests ------------------------------------------------------

const std::vector<Test> hostTests = {
    {"teardown closes the databases a runtime opened, rolling back what a "
     "statement left, and releases their files, whether the runtime or the "
     "module goes first",
     [](const std::string &directory) {
       const std::string plain = directory + "/plain.db";
       const std::string encrypted = directory + "/encrypted.db";
       for (bool isRuntimeFirst : {true, false}) {
         TestRuntime runtime;
         runtime.eval(
             "globalThis.plain = binding.openFile(" + literal(plain) +
             ");"
             "globalThis.encrypted = binding.openEncryptedFile(" +
             literal(encrypted) + ", " + keyJs +
             ");"
             "globalThis.memory = binding.openMemory();"
             "for (const database of [plain, encrypted, memory]) {"
             "  const statement = database.prepare("
             "    'create table if not exists t (a)');"
             "  statement.run([]);"
             "  statement.finalize();"
             "}"
             "plain.prepare('insert into t values (1)').run([]);"
             "globalThis.stepped = plain.prepare('select a from t');"
             "stepped.bind([]);"
             "stepped.step();");
         check(isHeld(plain) && isHeld(encrypted), "both files held");
         if (isRuntimeFirst) {
           runtime.runtime.reset();
           check(isHeld(plain) && isHeld(encrypted),
                 "both files held without the runtime");
           runtime.teardown();
         } else {
           runtime.teardown();
           check(runtime.text("JSON.stringify([" +
                              thrownBy("plain.prepare('select 1')") + ", " +
                              thrownBy("stepped.step()") + "])") ==
                     R"(["{\"message\":\"The database is closed.\"}","{\"message\":\"The statement is finalized.\"}"])",
                 "the handles to throw that they're closed");
           runtime.runtime.reset();
         }
         check(!isHeld(plain) && !isHeld(encrypted), "both files released");
       }
       TestRuntime reopened;
       check(reopened.text("const database = binding.openFile(" +
                           literal(plain) +
                           ");"
                           "const rows = database.prepare('select a from t')"
                           "  .run([]);"
                           "database.close();"
                           "JSON.stringify(rows)") == R"([{"a":1},{"a":1}])",
             "the plain database's rows");
       reopened.teardown();
     }},

    {"teardown with a write transaction open in an encrypted file rolls it "
     "back, and the next open sees the old rows and no journal",
     [](const std::string &directory) {
       const std::string path = directory + "/transaction.db";
       const std::string open =
           "binding.openEncryptedFile(" + literal(path) + ", " + keyJs + ")";
       TestRuntime runtime;
       runtime.eval("globalThis.database = " + open +
                    ";"
                    "const run = (sql) => database.prepare(sql).run([]);"
                    "run('create table t (a)');"
                    "run('insert into t values (1)');"
                    "run('begin');"
                    "run('insert into t values (2)');");
       check(exists(path + "-journal"), "a journal");
       runtime.teardown();
       check(!exists(path + "-journal") && !isHeld(path),
             "no journal and the file released");
       runtime.runtime.reset();

       TestRuntime next;
       check(next.text("const database = " + open +
                       ";"
                       "const rows = database.prepare('select a from t')"
                       "  .run([]);"
                       "database.close();"
                       "JSON.stringify(rows)") == R"([{"a":1}])",
             "the old rows");
       check(!exists(path + "-journal"), "no journal");
       next.teardown();
     }},

    {"after runtime A closes a file and runtime B opens it, A's late "
     "teardown leaves B's connection and its file alone",
     [](const std::string &directory) {
       const std::string open =
           "binding.openFile(" + literal(directory + "/shared.db") + ")";
       TestRuntime a;
       TestRuntime b;
       a.eval(open + ".close()");
       b.eval("globalThis.database = " + open);

       a.teardown();

       check(isHeld(directory + "/shared.db"), "B to hold the file");
       check(b.text("JSON.stringify(database.prepare('select 1 as a')"
                    "  .run([]))") == R"([{"a":1}])",
             "B's connection to work");
       b.eval("database.close()");
       check(!isHeld(directory + "/shared.db"), "the file released");
       b.teardown();
     }},

    {"100 cycles of opening and teardown end with no file held and no file "
     "descriptor open",
     [](const std::string &directory) {
       const std::string plain = directory + "/cycle-plain.db";
       const std::string encrypted = directory + "/cycle-encrypted.db";
       const int descriptors = openFileDescriptors();
       for (int cycle = 0; cycle < 100; cycle++) {
         TestRuntime runtime;
         runtime.eval("for (const database of ["
                      "  binding.openFile(" +
                      literal(plain) +
                      "),"
                      "  binding.openEncryptedFile(" +
                      literal(encrypted) + ", " + keyJs +
                      "),"
                      "  binding.openMemory(),"
                      "]) {"
                      "  database.prepare('create table if not exists t (a)')"
                      "    .run([]);"
                      "  database.prepare('insert into t values (1)').run([]);"
                      "  database.prepare('select a from t').bind([]);"
                      "}");
         runtime.teardown();
       }
       check(!isHeld(plain) && !isHeld(encrypted), "no file held");
       check(openFileDescriptors() == descriptors,
             "as many file descriptors as before");
     }},

    {"a collected handle keeps its connection open, holding its file, until "
     "teardown",
     [](const std::string &directory) {
       const std::string path = directory + "/collected.db";
       TestRuntime runtime;
       runtime.eval("globalThis.isCollected = false;"
                    "globalThis.registry = new FinalizationRegistry(() => {"
                    "  isCollected = true;"
                    "});"
                    "(() => {"
                    "  registry.register(binding.openFile(" +
                    literal(path) +
                    "), 0);"
                    "})();");
       for (int attempt = 0;
            attempt < 5 && !runtime.eval("isCollected").getBool(); attempt++) {
         runtime.rt().instrumentation().collectGarbage("test");
         runtime.rt().drainMicrotasks();
       }
       check(runtime.eval("isCollected").getBool(), "the handle collected");
       check(isHeld(path), "the file held");
       // Destroying the runtime runs every handle's destructor.
       runtime.runtime.reset();
       check(isHeld(path), "the file held without the runtime");
       runtime.teardown();
       check(!isHeld(path), "the file released");
     }},

    {"a collected statement keeps the write its step left in progress until "
     "teardown",
     [](const std::string &directory) {
       const std::string path = directory + "/collected-statement.db";
       TestRuntime runtime;
       runtime.eval("globalThis.database = binding.openFile(" + literal(path) +
                    ");"
                    "database.prepare('create table t (a)').run([]);"
                    "(() => {"
                    "  database.prepare('insert into t values (1) returning a')"
                    "    .step();"
                    "})();");
       check(exists(path + "-journal"), "a write in progress");
       // Destroying the runtime runs every handle's destructor.
       runtime.runtime.reset();
       check(exists(path + "-journal") && isHeld(path),
             "the write still in progress without the runtime");
       runtime.teardown();
       check(!exists(path + "-journal") && !isHeld(path),
             "the write completed and the file released");
     }},

    {"after teardown, opens throw, and the handles of its databases throw "
     "that they're closed",
     [](const std::string &directory) {
       const std::string path = directory + "/torn-down.db";
       TestRuntime runtime;
       runtime.eval("globalThis.database = binding.openMemory()");
       runtime.teardown();
       const std::string tornDown =
           R"("{\"message\":\"The native module was torn down.\"}")";
       check(runtime.text(
                 "JSON.stringify([" + thrownBy("binding.openMemory()") + ", " +
                 thrownBy("binding.openFile(" + literal(path) + ")") + ", " +
                 thrownBy("binding.openEncryptedFile(" + literal(path) + ", " +
                          keyJs + ")") +
                 ", " + thrownBy("database.prepare('select 1')") + "])") ==
                 "[" + tornDown + "," + tornDown + "," + tornDown +
                     R"(,"{\"message\":\"The database is closed.\"}"])",
             "opens to throw that the module was torn down");
       check(!exists(path), "no file created");
       check(!runtime.eval("binding.isFileOpen(" + literal(path) + ")")
                  .getBool(),
             "isFileOpen to work");
     }},

    {"createBinding throws the build check's error, as for a SQLite compiled "
     "without sqlite_config.h's options",
     [](const std::string &) {
       auto runtime = facebook::hermes::makeHermesRuntime();
       evolu_test_threadsafe = [] { return 1; };
       std::string message = "none";
       try {
         evolu::createBinding(*runtime, evolu::createRuntimeConnections());
       } catch (const jsi::JSError &error) {
         message = error.getMessage();
       }
       evolu_test_threadsafe = sqlite3_threadsafe;
       check(message ==
                 "SQLite was compiled without the options of sqlite_config.h.",
             "the build check's message, not " + message);
     }},

    {"an export's ArrayBuffer holds the export's bytes, which are wiped "
     "before they're freed when the runtime frees the buffer",
     [](const std::string &) {
       static std::atomic<uint8_t *> bytes{nullptr};
       static std::atomic<size_t> size{0};
       static std::atomic<bool> isWiped{false};
       isWiped = false;
       TestRuntime runtime;
       {
         jsi::ArrayBuffer buffer =
             runtime
                 .eval("const database = binding.openMemory();"
                       "database.prepare('create table t (a)').run([]);"
                       "database.prepare(\"insert into t values ('secret')\")"
                       "  .run([]);"
                       "globalThis.exported = database.export();"
                       "database.close();"
                       "exported")
                 .getObject(runtime.rt())
                 .getArrayBuffer(runtime.rt());
         bytes = buffer.data(runtime.rt());
         size = buffer.size(runtime.rt());
       }
       check(size > 0 && std::memcmp(bytes, "SQLite format 3", 16) == 0,
             "the buffer to hold the export");
       freeHook = [](void *p, int allocated) {
         if (p != bytes) return;
         bool isZero = static_cast<size_t>(allocated) >= size;
         for (size_t i = 0; i < size; i++) isZero = isZero && bytes[i] == 0;
         isWiped = isZero;
       };
       runtime.runtime.reset();
       freeHook = nullptr;
       check(isWiped, "the export's bytes wiped before the free");
       runtime.teardown();
     }},

    {"a second runtime's open on another thread is refused until the first "
     "runtime's teardown",
     [](const std::string &directory) {
       const std::string open =
           "binding.openFile(" + literal(directory + "/threads.db") + ")";
       std::mutex mutex;
       std::condition_variable changed;
       int step = 0;
       std::string failure;
       auto waitFor = [&](int expected) {
         std::unique_lock lock(mutex);
         changed.wait(lock, [&] { return step >= expected; });
       };
       auto advance = [&](int next) {
         std::lock_guard lock(mutex);
         step = next;
         changed.notify_all();
       };
       auto guarded = [&](std::function<void()> run) {
         return [&, run] {
           try {
             run();
           } catch (const std::exception &error) {
             std::lock_guard lock(mutex);
             failure = error.what();
             step = 99;
             changed.notify_all();
           }
         };
       };
       std::thread first(guarded([&] {
         TestRuntime runtime;
         runtime.eval("globalThis.database = " + open);
         advance(1);
         waitFor(2);
         runtime.teardown();
         runtime.runtime.reset();
         advance(3);
       }));
       std::thread second(guarded([&] {
         TestRuntime runtime;
         waitFor(1);
         check(runtime.text(thrownBy(open)) ==
                   R"({"message":"Another connection of this process has the database open.","cause":{"type":"DatabaseFileHeldError"}})",
               "the open refused");
         advance(2);
         waitFor(3);
         runtime.eval(open + ".close()");
         runtime.teardown();
       }));
       first.join();
       second.join();
       check(failure.empty(), "no failure, not " + failure);
     }},

    {"a teardown on another thread waits while a SQL function holds a step",
     [](const std::string &directory) {
       raceTeardown(directory + "/blocked.db", registerBlock,
                    "JSON.stringify(database.prepare("
                    "  'select block() as b').run([]))",
                    R"([{"b":1}])", "step");
     }},

    {"a teardown on another thread waits for an open in flight, then closes "
     "what it opened",
     [](const std::string &directory) {
       const std::string path = directory + "/opening.db";
       std::shared_ptr<evolu::RuntimeConnections> connections;
       std::string thrown;
       std::string failure;
       std::mutex mutex;
       std::condition_variable changed;
       bool isTornDown = false;
       {
         std::lock_guard lock(gate.mutex);
         gate.isEntered = false;
         gate.isReleased = false;
       }
       std::thread runner([&] {
         try {
           TestRuntime runtime;
           {
             std::lock_guard lock(mutex);
             connections = runtime.connections;
           }
           sqlite3_auto_extension(entryPoint(holdOpen));
           runtime.eval("globalThis.database = binding.openFile(" +
                        literal(path) + ")");
           {
             std::unique_lock lock(mutex);
             changed.wait(lock, [&] { return isTornDown; });
           }
           thrown = runtime.text(thrownBy("database.prepare('select 1')"));
         } catch (const std::exception &error) {
           {
             std::lock_guard lock(mutex);
             failure = error.what();
           }
           std::lock_guard lock(gate.mutex);
           gate.isEntered = true;
           gate.changed.notify_all();
         }
       });
       {
         std::unique_lock lock(gate.mutex);
         gate.changed.wait(lock, [] { return gate.isEntered; });
       }
       sqlite3_cancel_auto_extension(entryPoint(holdOpen));
       std::shared_ptr<evolu::RuntimeConnections> tornDown;
       {
         std::lock_guard lock(mutex);
         tornDown = connections;
       }
       std::atomic<bool> hasReturned{false};
       std::thread tearer;
       if (tornDown != nullptr)
         tearer = std::thread([&] {
           evolu::teardownRuntimeConnections(*tornDown);
           hasReturned = true;
         });
       std::this_thread::sleep_for(std::chrono::milliseconds(200));
       const bool returnedWhileOpening = hasReturned;
       {
         std::lock_guard lock(gate.mutex);
         gate.isReleased = true;
         gate.changed.notify_all();
       }
       if (tearer.joinable()) tearer.join();
       const bool wasHeld = isHeld(path);
       {
         std::lock_guard lock(mutex);
         isTornDown = true;
         changed.notify_all();
       }
       runner.join();
       check(failure.empty(), "no failure, not " + failure);
       check(!returnedWhileOpening, "the teardown to wait for the open");
       check(!wasHeld, "the file released");
       check(thrown == R"({"message":"The database is closed."})",
             "the handle to throw that it's closed, not " + thrown);
     }},

    {"a teardown on another thread waits while a SQL function holds a "
     "database run's step",
     [](const std::string &directory) {
       raceTeardown(directory + "/blocked-run.db", registerBlock,
                    "JSON.stringify(database.run('select block() as b', []))",
                    R"([{"b":1}])", "database run");
     }},

    {"a teardown on another thread waits for a close in progress",
     [](const std::string &directory) {
       raceTeardown(directory + "/closing.db", holdClose,
                    "String(database.close())", "undefined", "close");
     }},

    {"a teardown on another thread waits for a prepare in progress",
     [](const std::string &directory) {
       raceTeardown(directory + "/preparing.db", holdPrepare,
                    "typeof database.prepare("
                    "  \"select ('a' = 'b' collate block) as a\")",
                    "object", "prepare");
     }},

    {"a teardown on another thread waits for an export in progress",
     [](const std::string &directory) {
       raceTeardown(directory + "/exporting.db", holdExport,
                    "String(database.export().byteLength > 0)", "true",
                    "export");
     }},
};

// --- The runner ------------------------------------------------------------

struct Results {
  int count = 0;
  int failed = 0;

  void report(const std::string &name, const std::string &failure) {
    count++;
    if (failure.empty()) {
      std::printf("ok %d - %s\n", count, name.c_str());
    } else {
      failed++;
      std::printf("not ok %d - %s\n", count, name.c_str());
      std::istringstream lines(failure);
      for (std::string line; std::getline(lines, line);)
        std::printf("# %s\n", line.c_str());
    }
    std::fflush(stdout);
  }
};

// Runs the tests suite.js registers in one runtime with one binding.
void runSuites(const std::string &script, const std::string &directory,
               const std::string &filter, Results &results) {
  std::filesystem::create_directories(directory + "/conformance");
  std::filesystem::create_directories(directory + "/hermes");
  TestRuntime runtime;
  jsi::Runtime &rt = runtime.rt();
  rt.evaluateJavaScript(std::make_shared<jsi::StringBuffer>(script),
                        "suite.js");

  jsi::Object host(rt);
  host.setProperty(
      rt, "autoRegisterWriteLog",
      hostFunction(rt, "autoRegisterWriteLog",
                   [](jsi::Runtime &, const jsi::Value &,
                      const jsi::Value *args, size_t) {
                     if (args[0].getBool())
                       sqlite3_auto_extension(entryPoint(registerWriteLog));
                     else
                       sqlite3_cancel_auto_extension(
                           entryPoint(registerWriteLog));
                     return jsi::Value::undefined();
                   }));
  host.setProperty(
      rt, "startBackupOnOpen",
      hostFunction(rt, "startBackupOnOpen",
                   [](jsi::Runtime &, const jsi::Value &,
                      const jsi::Value *args, size_t) {
                     if (args[0].getBool())
                       sqlite3_auto_extension(entryPoint(startBackup));
                     else
                       sqlite3_cancel_auto_extension(entryPoint(startBackup));
                     return jsi::Value::undefined();
                   }));
  host.setProperty(rt, "finishBackups",
                   hostFunction(rt, "finishBackups",
                                [](jsi::Runtime &, const jsi::Value &,
                                   const jsi::Value *, size_t) {
                                  finishBackups();
                                  return jsi::Value::undefined();
                                }));
  host.setProperty(
      rt, "failSqliteAllocations",
      hostFunction(rt, "failSqliteAllocations",
                   [](jsi::Runtime &, const jsi::Value &,
                      const jsi::Value *args, size_t) {
                     return jsi::Value(
                         allocationsLeft.exchange(
                             static_cast<int>(args[0].getNumber())) == -2);
                   }));
  host.setProperty(rt, "failRandom",
                   hostFunction(rt, "failRandom",
                                [](jsi::Runtime &, const jsi::Value &,
                                   const jsi::Value *args, size_t) {
                                  evolu_test_random_fails = args[0].getBool();
                                  return jsi::Value::undefined();
                                }));

  std::vector<std::pair<std::string, jsi::Function>> tests;
  jsi::Object options(rt);
  options.setProperty(rt, "binding", rt.global().getProperty(rt, "binding"));
  options.setProperty(rt, "host", host);
  options.setProperty(rt, "directory",
                      jsi::String::createFromUtf8(rt, directory));
  options.setProperty(
      rt, "test",
      hostFunction(rt, "test",
                   [&tests](jsi::Runtime &rt, const jsi::Value &,
                            const jsi::Value *args, size_t) {
                     tests.emplace_back(
                         args[0].getString(rt).utf8(rt),
                         args[1].getObject(rt).getFunction(rt));
                     return jsi::Value::undefined();
                   }));
  rt.global()
      .getPropertyAsObject(rt, "EvoluHermesSuite")
      .getPropertyAsFunction(rt, "registerSuites")
      .call(rt, options);

  jsi::Function stringify =
      rt.global().getPropertyAsObject(rt, "JSON").getPropertyAsFunction(
          rt, "stringify");
  for (auto &[name, function] : tests) {
    if (name.find(filter) == std::string::npos) continue;
    std::string failure;
    try {
      function.call(rt);
    } catch (const jsi::JSError &error) {
      failure = error.getMessage() + "\n";
      // An assertion's values, which @evolu/common's AssertionError has.
      if (error.value().isObject())
        for (const char *property : {"actual", "expected"}) {
          jsi::Value value =
              error.value().getObject(rt).getProperty(rt, property);
          if (!value.isUndefined())
            failure += std::string(property) + ": " +
                       stringify.call(rt, value).toString(rt).utf8(rt) + "\n";
        }
      failure += error.getStack();
    } catch (const std::exception &error) {
      failure = error.what();
    }
    results.report(name, failure);
  }
  tests.clear();
  runtime.teardown();
}

} // namespace

int main(int argc, char **argv) {
  if (argc < 3) {
    std::fprintf(stderr, "Usage: %s <suite.js> <directory> [filter]\n",
                 argv[0]);
    return 2;
  }
  const std::string directory = argv[2];
  const std::string filter = argc > 3 ? argv[3] : "";
  Results results;
  try {
    installAllocator();
    runSuites(readFile(argv[1]), directory, filter, results);
    for (size_t index = 0; index < hostTests.size(); index++) {
      const Test &test = hostTests[index];
      if (test.name.find(filter) == std::string::npos) continue;
      const std::string testDirectory =
          directory + "/host-" + std::to_string(index);
      std::filesystem::create_directories(testDirectory);
      std::string failure;
      try {
        test.run(testDirectory);
      } catch (const std::exception &error) {
        failure = error.what();
      }
      results.report(test.name, failure);
    }
    // What the tests left registered keeps SQLite memory, which reset frees.
    finishBackups();
    sqlite3_reset_auto_extension();
    results.report("every SQLite allocation is freed",
                   liveAllocations == 0
                       ? ""
                       : std::to_string(liveAllocations.load()) +
                             " SQLite allocations are still live.");
  } catch (const std::exception &error) {
    std::printf("Bail out! %s\n", error.what());
    return 1;
  }
  std::printf("1..%d\n# %d failed\n", results.count, results.failed);
  return results.failed == 0 ? 0 : 1;
}
