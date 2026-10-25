/*
 * The core runs the pinned SQLite release with the compile options of
 * src/sqlite_config.h. The build passes the pinned version and check-in as
 * EVOLU_TEST_SQLITE_VERSION and EVOLU_TEST_SQLITE_CHECK_IN. Test names start
 * with sqlite_, so the suite runs alone with
 * `node packages/sqlite-core/scripts/test.mts sqlite_`.
 */
#include "test.h"

#include "sqlite3.h"
#include "sqlite_config.h"

#include <string.h>

// SQLite reads it only for the locking styles sqlite_config.h turns off, and
// without it warns on every iOS compile. No compile option lists it.
_Static_assert(HAVE_GETHOSTUUID == 0, "HAVE_GETHOSTUUID is 0");

static void sqlite_runs_the_pinned_release(void) {
  const char *source = sqlite3_sourceid();
  size_t length = strlen(source);
  size_t checkInLength = strlen(EVOLU_TEST_SQLITE_CHECK_IN);

  CHECK_EQ_STR(sqlite3_libversion(), EVOLU_TEST_SQLITE_VERSION);
  CHECK(length >= checkInLength);
  CHECK_EQ_STR(source + length - checkInLength, EVOLU_TEST_SQLITE_CHECK_IN);
}

static void sqlite_uses_the_core_compile_options(void) {
  static const char *const used[] = {
      "THREADSAFE=2",
      "TEMP_STORE=3",
      "DEFAULT_MEMSTATUS=0",
      "OMIT_LOAD_EXTENSION",
      "DQS=0",
      "ENABLE_MATH_FUNCTIONS",
      "OMIT_INCRBLOB",
      "OMIT_INTROSPECTION_PRAGMAS",
      "OMIT_PROGRESS_CALLBACK",
      // Unlike SQLite's default on Apple platforms, so the macOS host runs
      // the locking iOS ships.
      "ENABLE_LOCKING_STYLE=0",
  };
  for (size_t i = 0; i < sizeof used / sizeof used[0]; i++)
    CHECK(sqlite3_compileoption_used(used[i]));
  // The authorizer, with which the binding refuses keying pragmas on plain
  // connections.
  CHECK(!sqlite3_compileoption_used("OMIT_AUTHORIZATION"));

  // SQLite's defaults, for plain databases: direct overflow reads, and
  // memory-mapped I/O up to SQLite's limit once PRAGMA mmap_size asks for it.
  CHECK(sqlite3_compileoption_used("DIRECT_OVERFLOW_READ"));
  CHECK(!sqlite3_compileoption_used("MAX_MMAP_SIZE=0"));
  CHECK_EQ_INT(sqlite3_threadsafe(), 2);
}

static void sqlite_opens_an_in_memory_database(void) {
  sqlite3 *db = NULL;
  sqlite3_stmt *statement = NULL;

  CHECK_EQ_INT(sqlite3_open_v2(":memory:", &db,
                               SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE |
                                   SQLITE_OPEN_NOMUTEX,
                               NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_prepare_v2(db, "select 1 + 1", -1, &statement, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_step(statement), SQLITE_ROW);
  CHECK_EQ_INT(sqlite3_column_int(statement, 0), 2);
  CHECK_EQ_INT(sqlite3_finalize(statement), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/*
 * The runner is built with AddressSanitizer, which sees no free inside a
 * connection's lookaside buffer, so that build turns lookaside off.
 */
static void sqlite_sanitized_build_uses_no_lookaside(void) {
  sqlite3 *db = NULL;
  sqlite3_stmt *statement = NULL;
  int current = -1;
  int highwater = -1;

  CHECK_EQ_INT(sqlite3_open_v2(":memory:", &db,
                               SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE |
                                   SQLITE_OPEN_NOMUTEX,
                               NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_prepare_v2(db, "select 'look' || 'aside'", -1,
                                  &statement, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_step(statement), SQLITE_ROW);
  CHECK_EQ_INT(sqlite3_db_status(db, SQLITE_DBSTATUS_LOOKASIDE_USED, &current,
                                 &highwater, 0),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_finalize(statement), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK_EQ_INT(highwater, 0);
}

void sqlite_suite(void) {
  RUN(sqlite_runs_the_pinned_release);
  RUN(sqlite_uses_the_core_compile_options);
  RUN(sqlite_opens_an_in_memory_database);
  RUN(sqlite_sanitized_build_uses_no_lookaside);
}
