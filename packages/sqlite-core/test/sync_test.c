/*
 * How the core's connections sync: on Apple platforms, with F_BARRIERFSYNC in
 * place of SQLite's F_FULLFSYNC (evolu_codec.h), and elsewhere as SQLite syncs.
 * Files live in a temporary directory the suite creates and removes. Test
 * names start with sync_, so the suite runs alone with
 * `node packages/sqlite-core/scripts/test.mts sync_`.
 */
// mkdtemp, which macOS declares only with _DARWIN_C_SOURCE, as F_GETPATH and
// RTLD_NEXT.
#define _POSIX_C_SOURCE 200809L
#define _DARWIN_C_SOURCE

#include "test.h"

#include "evolu_codec.h"
#include "evolu_database.h"
#include "evolu_skiplist.h"
#include "sqlite3.h"

#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#if defined(__APPLE__)
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdarg.h>
#include <sys/param.h>
#include <sys/stat.h>
#include <sys/wait.h>
#define IS_APPLE 1
#else
#define IS_APPLE 0
#endif

static const char vfs_name[] = "evolu-codec-sync-test";

static char directory[256];

/*
 * Creates the temporary directory, registers the codec VFS and checks the
 * binding's build, which registers its own, once, at the first test that runs,
 * so a filter that skips the suite creates nothing. Returns 0 when that fails,
 * which the test's CHECK reports.
 */
static int set_up(void) {
  if (directory[0] != '\0') return 1;
  const char *tmp = getenv("TMPDIR");
  snprintf(directory, sizeof directory, "%s/evolu-sync-XXXXXX",
           tmp != NULL && tmp[0] != '\0' ? tmp : "/tmp");
  if (mkdtemp(directory) == NULL) {
    directory[0] = '\0';
    return 0;
  }
  evolu_database_error error;
  return evolu_codec_register(vfs_name, NULL) == SQLITE_OK &&
         evolu_database_check_build(&error) == SQLITE_OK;
}

/* Removes the temporary directory with whatever a failed test left in it. */
static void remove_directory(void) {
  DIR *entries = opendir(directory);
  if (entries != NULL) {
    struct dirent *entry;
    while ((entry = readdir(entries)) != NULL) {
      if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0)
        continue;
      char path[600];
      snprintf(path, sizeof path, "%s/%s", directory, entry->d_name);
      unlink(path);
    }
    closedir(entries);
  }
  rmdir(directory);
  directory[0] = '\0';
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

static sqlite3_vfs *unix_vfs(void) { return sqlite3_vfs_find("unix"); }

static int (*sqlite_set_system_call)(sqlite3_vfs *, const char *,
                                     sqlite3_syscall_ptr);
static int set_system_calls;

static int counting_set_system_call(sqlite3_vfs *vfs, const char *name,
                                    sqlite3_syscall_ptr call) {
  set_system_calls++;
  return sqlite_set_system_call(vfs, name, call);
}

static void sync_core_register_turns_fullfsync_on_only_on_apple(void) {
  sqlite3 *db = NULL;
  CHECK_EQ_INT(sqlite3_open_v2(":memory:", &db, SQLITE_OPEN_READWRITE, NULL),
               SQLITE_OK);
  long long before = query_int(db, "pragma fullfsync");
  int rc = evolu_core_register(db);
  long long after = query_int(db, "pragma fullfsync");
  evolu_skiplist_finalize(db);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK_EQ_INT(rc, SQLITE_OK);
  CHECK_EQ_INT(before, 0);
  CHECK_EQ_INT(after, IS_APPLE);
}

static int denies_fullfsync(void *context, int action, const char *name,
                            const char *value, const char *database,
                            const char *trigger) {
  (void)context;
  (void)value;
  (void)database;
  (void)trigger;
  return action == SQLITE_PRAGMA && strcmp(name, "fullfsync") == 0
             ? SQLITE_DENY
             : SQLITE_OK;
}

/*
 * On Apple platforms, an authorizer that denies PRAGMA fullfsync fails
 * evolu_core_register, which turns it on (evolu_skiplist.h).
 */
static void sync_core_register_fails_where_an_authorizer_denies_fullfsync(
    void) {
  sqlite3 *db = NULL;
  CHECK_EQ_INT(sqlite3_open_v2(":memory:", &db, SQLITE_OPEN_READWRITE, NULL),
               SQLITE_OK);
  sqlite3_set_authorizer(db, denies_fullfsync, NULL);
  int rc = evolu_core_register(db);
  evolu_skiplist_finalize(db);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  CHECK_EQ_INT(rc, IS_APPLE ? SQLITE_AUTH : SQLITE_OK);
}

/*
 * Registering a codec VFS replaces the unix VFS's fcntl on Apple platforms
 * only, and registering another keeps that replacement without writing
 * SQLite's table again. The test restores SQLite's own fcntl first, since
 * earlier tests registered codec VFSes, and counts the writes.
 */
static void sync_codec_register_replaces_the_unix_fcntl_only_on_apple(void) {
  CHECK(set_up());
  sqlite3_vfs *vfs = unix_vfs();
  // NULL restores SQLite's own.
  vfs->xSetSystemCall(vfs, "fcntl", NULL);
  sqlite3_syscall_ptr original = vfs->xGetSystemCall(vfs, "fcntl");
  sqlite_set_system_call = vfs->xSetSystemCall;
  vfs->xSetSystemCall = counting_set_system_call;
  set_system_calls = 0;
  int registered = evolu_codec_register("evolu-codec-sync-test-fresh", NULL);
  int writes = set_system_calls;
  sqlite3_syscall_ptr installed = vfs->xGetSystemCall(vfs, "fcntl");
  set_system_calls = 0;
  int registered_another =
      evolu_codec_register("evolu-codec-sync-test-other", NULL);
  int writes_again = set_system_calls;
  vfs->xSetSystemCall = sqlite_set_system_call;
  sqlite3_syscall_ptr kept = vfs->xGetSystemCall(vfs, "fcntl");
  CHECK_EQ_INT(registered, SQLITE_OK);
  CHECK_EQ_INT(registered_another, SQLITE_OK);
  CHECK(original != NULL);
  CHECK_EQ_INT(installed != original, IS_APPLE);
  CHECK_EQ_INT(writes, IS_APPLE);
  CHECK_EQ_INT(writes_again, 0);
  CHECK(kept == installed);
}

#if defined(__APPLE__)
static const uint8_t test_key[EVOLU_CODEC_KEY_SIZE] = {
    1,  2,  3,  4,  5,  6,  7,  8,  9,  10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32};

/* Writes directory/name into path, which holds 512 bytes. */
static void path_of(char path[512], const char *name) {
  snprintf(path, 512, "%s/%s", directory, name);
}

/*
 * What the replacement of the unix VFS's fcntl passes to fcntl, which
 * evolu_test_fcntl stands for, and the fsync() calls SQLite makes itself,
 * which this file's fsync sees, and, while files are recorded, which files
 * SQLite writes, truncates and deletes, through the unix VFS's pwrite,
 * ftruncate and unlink.
 */
typedef enum {
  EVENT_BARRIER,
  EVENT_FULL_FLUSH,
  EVENT_FSYNC,
  EVENT_LOCK,
  EVENT_UNEXPECTED_FCNTL,
  EVENT_WRITE,
  EVENT_TRUNCATE,
  EVENT_DELETE,
} EventType;

typedef enum {
  FILE_DATABASE,
  FILE_JOURNAL,
  FILE_WAL,
  FILE_DIRECTORY,
  FILE_OTHER,
} FileKind;

typedef struct {
  EventType type;
  int fd;
  FileKind file;
  /* A write's offset. */
  long long offset;
  /* An fsync()'s result. */
  int result;
  /* Whether a truncation made its file shorter. */
  int shrinks;
} Event;

static Event events[1024];
static int event_count;
// Other suites' threads call this file's fsync.
static _Atomic int is_recording;
static int is_overflowed;
static int fails_barriers;
static int fails_full_flushes;

static int ends_with(const char *path, const char *suffix) {
  size_t length = strlen(path);
  size_t suffix_length = strlen(suffix);
  return length > suffix_length &&
         strcmp(path + length - suffix_length, suffix) == 0;
}

static FileKind kind_of_path(const char *path) {
  return ends_with(path, "-journal") ? FILE_JOURNAL
         : ends_with(path, "-wal")   ? FILE_WAL
         : ends_with(path, ".db")    ? FILE_DATABASE
                                     : FILE_OTHER;
}

static FileKind kind_of(int fd) {
  struct stat status;
  char path[MAXPATHLEN];
  if (fd < 0 || fstat(fd, &status) != 0) return FILE_OTHER;
  if (S_ISDIR(status.st_mode)) return FILE_DIRECTORY;
  return fcntl(fd, F_GETPATH, path) == 0 ? kind_of_path(path) : FILE_OTHER;
}

static void record_event(Event event) {
  if (!is_recording) return;
  if (event_count == sizeof events / sizeof events[0]) {
    is_overflowed = 1;
    return;
  }
  events[event_count++] = event;
}

static void record(EventType type, int fd) {
  record_event((Event){.type = type, .fd = fd, .file = kind_of(fd)});
}

/* Reads its argument as Apple's fcntl does for the operations SQLite uses. */
static int recording_fcntl(int fd, int op, ...) {
  if (op == F_BARRIERFSYNC || op == F_FULLFSYNC) {
    int is_barrier = op == F_BARRIERFSYNC;
    record(is_barrier ? EVENT_BARRIER : EVENT_FULL_FLUSH, fd);
    // A barrier fails with another error than a full flush, so a test sees
    // which reached SQLite.
    if (is_barrier ? fails_barriers : fails_full_flushes) {
      errno = is_barrier ? EINVAL : ENOTSUP;
      return -1;
    }
    return fcntl(fd, op, 0);
  }
  va_list arguments;
  va_start(arguments, op);
  struct flock *lock = va_arg(arguments, struct flock *);
  va_end(arguments);
  // Another operation would need its own branch in the replacement.
  record(op == F_GETLK || op == F_SETLK || op == F_SETLKW
             ? EVENT_LOCK
             : EVENT_UNEXPECTED_FCNTL,
         fd);
  return fcntl(fd, op, lock);
}

static int (*system_fsync)(int);

static void load_system_fsync(void) {
  system_fsync = (int (*)(int))dlsym(RTLD_NEXT, "fsync");
}

/*
 * The fsync() SQLite calls in the test runner, which this definition replaces
 * to record each call with the system's result: of a journal's or a log's
 * directory, of a plain file with fullfsync off, of a plain journal before its
 * playback, and of a file whose barrier and full flush both failed. Other
 * suites' threads call it too, so the system's is looked up once.
 */
int fsync(int fd) {
  static pthread_once_t once = PTHREAD_ONCE_INIT;
  pthread_once(&once, load_system_fsync);
  int rc = system_fsync(fd);
  if (is_recording) {
    // Recording reads the file's kind, which mustn't change the errno SQLite
    // reads after a failed sync.
    int failure = errno;
    record_event((Event){
        .type = EVENT_FSYNC, .fd = fd, .file = kind_of(fd), .result = rc});
    errno = failure;
  }
  return rc;
}

static ssize_t (*system_pwrite)(int, const void *, size_t, off_t);
static int (*system_ftruncate)(int, off_t);
static int (*system_unlink)(const char *);

static ssize_t recording_pwrite(int fd, const void *buffer, size_t size,
                                off_t offset) {
  record_event((Event){.type = EVENT_WRITE,
                       .fd = fd,
                       .file = kind_of(fd),
                       .offset = (long long)offset});
  return system_pwrite(fd, buffer, size, offset);
}

static int recording_ftruncate(int fd, off_t size) {
  struct stat status;
  record_event((Event){
      .type = EVENT_TRUNCATE,
      .fd = fd,
      .file = kind_of(fd),
      .shrinks = fstat(fd, &status) == 0 && size < status.st_size});
  return system_ftruncate(fd, size);
}

static int recording_unlink(const char *path) {
  record_event(
      (Event){.type = EVENT_DELETE, .fd = -1, .file = kind_of_path(path)});
  return system_unlink(path);
}

static void start_recording(int records_files) {
  event_count = 0;
  is_overflowed = 0;
  is_recording = 1;
  evolu_test_fcntl = recording_fcntl;
  if (!records_files) return;
  sqlite3_vfs *vfs = unix_vfs();
  system_pwrite = (ssize_t (*)(int, const void *, size_t, off_t))
                      vfs->xGetSystemCall(vfs, "pwrite");
  system_ftruncate =
      (int (*)(int, off_t))vfs->xGetSystemCall(vfs, "ftruncate");
  system_unlink = (int (*)(const char *))vfs->xGetSystemCall(vfs, "unlink");
  vfs->xSetSystemCall(vfs, "pwrite", (sqlite3_syscall_ptr)recording_pwrite);
  vfs->xSetSystemCall(vfs, "ftruncate",
                      (sqlite3_syscall_ptr)recording_ftruncate);
  vfs->xSetSystemCall(vfs, "unlink", (sqlite3_syscall_ptr)recording_unlink);
}

/* Stops recording, before a test checks what it recorded. */
static void stop_recording(void) {
  is_recording = 0;
  evolu_test_fcntl = fcntl;
  fails_barriers = 0;
  fails_full_flushes = 0;
  sqlite3_vfs *vfs = unix_vfs();
  // NULL restores SQLite's own.
  vfs->xSetSystemCall(vfs, "pwrite", NULL);
  vfs->xSetSystemCall(vfs, "ftruncate", NULL);
  vfs->xSetSystemCall(vfs, "unlink", NULL);
}

static int count_events(EventType type, FileKind file) {
  int count = 0;
  for (int i = 0; i < event_count; i++)
    count += events[i].type == type && events[i].file == file;
  return count;
}

static int count_type(EventType type) {
  int count = 0;
  for (int i = 0; i < event_count; i++) count += events[i].type == type;
  return count;
}

/*
 * Unexpected fcntl operations, full flushes, barriers of other files than a
 * database's and a journal's, and an fsync() of a file, which orders nothing,
 * but a journal's when allows_journal_fsync.
 */
static int count_unexpected(int allows_journal_fsync) {
  int count = 0;
  for (int i = 0; i < event_count; i++) {
    const Event *event = &events[i];
    count += event->type == EVENT_UNEXPECTED_FCNTL ||
             event->type == EVENT_FULL_FLUSH ||
             (event->type == EVENT_BARRIER && event->file != FILE_DATABASE &&
              event->file != FILE_JOURNAL) ||
             (event->type == EVENT_FSYNC && event->file != FILE_DIRECTORY &&
              !(allows_journal_fsync && event->file == FILE_JOURNAL));
  }
  return count;
}

/*
 * Whether the recorded events wrote the database, after a barrier on the
 * journal that followed its last write when requires_journal_barrier, and
 * deleted or truncated the journal only after a barrier on the database that
 * followed its last write.
 */
static int is_ordered_by_barriers(int requires_journal_barrier) {
  int is_journal_ordered = 0;
  int is_database_ordered = 1;
  int database_writes = 0;
  int invalidations = 0;
  for (int i = 0; i < event_count; i++) {
    const Event *event = &events[i];
    if (event->type == EVENT_BARRIER && event->file == FILE_JOURNAL) {
      is_journal_ordered = 1;
    } else if (event->type == EVENT_WRITE && event->file == FILE_JOURNAL) {
      is_journal_ordered = 0;
    } else if (event->type == EVENT_BARRIER && event->file == FILE_DATABASE) {
      is_database_ordered = 1;
    } else if (event->type == EVENT_WRITE && event->file == FILE_DATABASE) {
      if (requires_journal_barrier && !is_journal_ordered) return 0;
      is_database_ordered = 0;
      database_writes++;
    } else if ((event->type == EVENT_DELETE ||
                event->type == EVENT_TRUNCATE) &&
               event->file == FILE_JOURNAL) {
      if (database_writes == 0 || !is_database_ordered) return 0;
      invalidations++;
    }
  }
  return database_writes > 0 && invalidations > 0;
}

/* The replacement of the unix VFS's fcntl, as SQLite calls it. */
static int (*replacement(void))(int, int, ...) {
  sqlite3_vfs *vfs = unix_vfs();
  return (int (*)(int, int, ...))vfs->xGetSystemCall(vfs, "fcntl");
}

static void remove_database(const char *path) {
  static const char *const suffixes[] = {"", "-journal", "-wal", "-shm"};
  for (size_t i = 0; i < sizeof suffixes / sizeof suffixes[0]; i++) {
    char file[600];
    snprintf(file, sizeof file, "%s%s", path, suffixes[i]);
    unlink(file);
  }
}

/*
 * Opens path into *db, keyed on the codec VFS, or with the binding as a plain
 * file, into *database too.
 */
static int open_database(const char *path, int is_plain, sqlite3 **db,
                         evolu_database **database) {
  *database = NULL;
  if (!is_plain) return evolu_codec_open(path, db, vfs_name, test_key, 0);
  evolu_database_error error;
  int rc = evolu_database_open_file(path, strlen(path), database, &error);
  *db = rc == SQLITE_OK ? evolu_database_connection(*database) : NULL;
  return rc;
}

static int close_database(sqlite3 *db, evolu_database *database) {
  return database != NULL ? evolu_database_close(database) : sqlite3_close(db);
}

/* Creates the database at path with table t and rows rows. */
static int create_database(const char *path, int is_plain, int rows) {
  remove_database(path);
  sqlite3 *db = NULL;
  evolu_database *database = NULL;
  int rc = open_database(path, is_plain, &db, &database);
  if (rc == SQLITE_OK)
    rc = sqlite3_exec(db, "create table t (v text)", NULL, NULL, NULL);
  char sql[256];
  snprintf(sql, sizeof sql,
           "with recursive n(i) as (select 1 union all select i + 1 from n "
           "where i < %d) insert into t select printf('%%.3000c', 'x') from n",
           rows);
  if (rc == SQLITE_OK) rc = sqlite3_exec(db, sql, NULL, NULL, NULL);
  int closed = close_database(db, database);
  return rc == SQLITE_OK ? closed : rc;
}

static void sync_replacement_issues_a_barrier_and_falls_back_to_a_full_flush(
    void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "flush.db");
  int fd = open(path, O_RDWR | O_CREAT | O_TRUNC, 0600);
  CHECK(fd >= 0);
  start_recording(0);
  int barrier = replacement()(fd, F_FULLFSYNC, 0);
  fails_barriers = 1;
  int full_flush = replacement()(fd, F_FULLFSYNC, 0);
  fails_full_flushes = 1;
  int neither = replacement()(fd, F_FULLFSYNC, 0);
  int neither_errno = errno;
  stop_recording();
  close(fd);
  unlink(path);

  CHECK_EQ_INT(barrier, 0);
  // A barrier that fails with EINVAL escalates, not only with ENOTSUP.
  CHECK_EQ_INT(full_flush, 0);
  // The full flush's error, after which SQLite syncs with fsync().
  CHECK_EQ_INT(neither, -1);
  CHECK_EQ_INT(neither_errno, ENOTSUP);
  static const EventType expected[] = {EVENT_BARRIER, EVENT_BARRIER,
                                       EVENT_FULL_FLUSH, EVENT_BARRIER,
                                       EVENT_FULL_FLUSH};
  CHECK_EQ_INT(event_count, sizeof expected / sizeof expected[0]);
  for (int i = 0; i < event_count; i++) {
    CHECK_EQ_INT(events[i].type, expected[i]);
    CHECK_EQ_INT(events[i].fd, fd);
  }
}

/*
 * Two commits each, on a codec file and on a plain file the binding opens, in
 * normal locking mode and in the exclusive mode with a journal size limit of
 * 0 that React Native's encrypted databases use, whose second commit reuses
 * the journal the first truncated, write the database after a barrier on the
 * journal and invalidate the journal after a barrier on the database.
 */
static void sync_commits_are_ordered_with_barriers(void) {
  CHECK(set_up());
  static const char *const names[] = {"codec.db", "exclusive.db", "plain.db"};
  char paths[3][512];
  sqlite3 *connections[3];
  evolu_database *databases[3];
  for (int i = 0; i < 3; i++) {
    path_of(paths[i], names[i]);
    CHECK_EQ_INT(create_database(paths[i], i == 2, 1), SQLITE_OK);
    CHECK_EQ_INT(
        open_database(paths[i], i == 2, &connections[i], &databases[i]),
        SQLITE_OK);
  }
  CHECK_EQ_INT(sqlite3_exec(connections[1],
                            "pragma journal_size_limit = 0; pragma "
                            "locking_mode = exclusive; begin exclusive; commit",
                            NULL, NULL, NULL),
               SQLITE_OK);

  int rcs[3][2];
  int overflows[3][2];
  int is_ordered[3][2];
  int unexpected[3][2];
  int journal_deletes[3][2];
  for (int i = 0; i < 3; i++) {
    for (int commit = 0; commit < 2; commit++) {
      start_recording(1);
      rcs[i][commit] = sqlite3_exec(
          connections[i], "insert into t values ('y')", NULL, NULL, NULL);
      stop_recording();
      overflows[i][commit] = is_overflowed;
      is_ordered[i][commit] = is_ordered_by_barriers(1);
      unexpected[i][commit] = count_unexpected(0);
      journal_deletes[i][commit] = count_events(EVENT_DELETE, FILE_JOURNAL);
    }
  }
  for (int i = 0; i < 3; i++) {
    CHECK_EQ_INT(close_database(connections[i], databases[i]), SQLITE_OK);
    remove_database(paths[i]);
  }
  for (int i = 0; i < 3; i++) {
    for (int commit = 0; commit < 2; commit++) {
      CHECK_EQ_INT(rcs[i][commit], SQLITE_OK);
      CHECK(!overflows[i][commit]);
      CHECK(is_ordered[i][commit]);
      CHECK_EQ_INT(unexpected[i][commit], 0);
      // In exclusive mode, the journal stays, truncated.
      CHECK_EQ_INT(journal_deletes[i][commit], i != 1);
    }
  }
}

/*
 * A commit that shrinks the database in exclusive locking mode, as one that
 * frees pages under auto_vacuum = FULL, truncates the database only after a
 * barrier on the journal it truncated, since the journal records no page the
 * truncation drops.
 */
static void sync_shrinking_commit_truncates_after_a_journal_barrier(void) {
  CHECK(set_up());
  for (int is_plain = 0; is_plain < 2; is_plain++) {
    char path[512];
    path_of(path, "shrink.db");
    remove_database(path);
    sqlite3 *db = NULL;
    evolu_database *database = NULL;
    CHECK_EQ_INT(open_database(path, is_plain, &db, &database), SQLITE_OK);
    int rc = sqlite3_exec(
        db,
        "pragma auto_vacuum = full; create table t (v text); with recursive "
        "n(i) as (select 1 union all select i + 1 from n where i < 50) insert "
        "into t select printf('%.3000c', 'x') from n; pragma "
        "journal_size_limit = 0; pragma locking_mode = exclusive; begin "
        "exclusive; commit",
        NULL, NULL, NULL);
    start_recording(1);
    if (rc == SQLITE_OK)
      rc = sqlite3_exec(db, "delete from t", NULL, NULL, NULL);
    stop_recording();
    CHECK_EQ_INT(close_database(db, database), SQLITE_OK);
    remove_database(path);
    CHECK_EQ_INT(rc, SQLITE_OK);
    CHECK(!is_overflowed);
    CHECK_EQ_INT(count_unexpected(0), 0);
    CHECK(is_ordered_by_barriers(1));

    int journal_truncated = -1;
    int barrier_after = -1;
    int shrinks = 0;
    for (int i = 0; i < event_count; i++) {
      const Event *event = &events[i];
      if (event->type == EVENT_TRUNCATE && event->file == FILE_JOURNAL) {
        journal_truncated = i;
        barrier_after = -1;
      } else if (event->type == EVENT_BARRIER &&
                 event->file == FILE_JOURNAL && journal_truncated >= 0) {
        barrier_after = i;
      } else if (event->type == EVENT_TRUNCATE &&
                 event->file == FILE_DATABASE && event->shrinks) {
        CHECK(journal_truncated >= 0);
        CHECK(barrier_after > journal_truncated);
        shrinks++;
      }
    }
    CHECK(shrinks > 0);
  }
}

/*
 * SQLite syncs the directory of a journal it creates with fsync(), not a
 * barrier. With synchronous = FULL, its default, it then syncs the journal
 * again, so a barrier orders the directory entry before the database's pages,
 * which could otherwise persist without the journal that rolls them back.
 */
static void sync_new_journals_directory_sync_precedes_a_barrier(void) {
  CHECK(set_up());
  for (int is_plain = 0; is_plain < 2; is_plain++) {
    char path[512];
    path_of(path, "directory.db");
    CHECK_EQ_INT(create_database(path, is_plain, 1), SQLITE_OK);
    sqlite3 *db = NULL;
    evolu_database *database = NULL;
    CHECK_EQ_INT(open_database(path, is_plain, &db, &database), SQLITE_OK);
    start_recording(1);
    int rc = sqlite3_exec(db, "insert into t values ('y')", NULL, NULL, NULL);
    stop_recording();
    CHECK_EQ_INT(close_database(db, database), SQLITE_OK);
    remove_database(path);
    CHECK_EQ_INT(rc, SQLITE_OK);
    CHECK(!is_overflowed);
    CHECK_EQ_INT(count_unexpected(0), 0);

    int directory_sync = -1;
    int barrier_after = -1;
    int database_writes = 0;
    for (int i = 0; i < event_count; i++) {
      if (events[i].type == EVENT_FSYNC && events[i].file == FILE_DIRECTORY) {
        CHECK_EQ_INT(events[i].result, 0);
        CHECK(directory_sync < 0);
        directory_sync = i;
      } else if (directory_sync >= 0 && barrier_after < 0 &&
                 events[i].type == EVENT_BARRIER &&
                 events[i].file == FILE_JOURNAL) {
        barrier_after = i;
      } else if (events[i].type == EVENT_WRITE &&
                 events[i].file == FILE_DATABASE) {
        CHECK(directory_sync >= 0);
        CHECK(barrier_after > directory_sync);
        database_writes++;
      }
    }
    CHECK(database_writes > 0);
  }
}

/*
 * With fullfsync turned off, a plain file syncs with fsync(), as SQLite does,
 * while a codec file keeps barriers (Syncs in evolu_codec.h).
 */
static void sync_fullfsync_off_keeps_barriers_only_on_codec_files(void) {
  CHECK(set_up());
  for (int is_plain = 0; is_plain < 2; is_plain++) {
    char path[512];
    path_of(path, "unsynced.db");
    CHECK_EQ_INT(create_database(path, is_plain, 1), SQLITE_OK);
    sqlite3 *db = NULL;
    evolu_database *database = NULL;
    CHECK_EQ_INT(open_database(path, is_plain, &db, &database), SQLITE_OK);
    int rc = sqlite3_exec(db, "pragma fullfsync = off", NULL, NULL, NULL);
    start_recording(0);
    if (rc == SQLITE_OK)
      rc = sqlite3_exec(db, "insert into t values ('y')", NULL, NULL, NULL);
    stop_recording();
    CHECK_EQ_INT(close_database(db, database), SQLITE_OK);
    remove_database(path);
    CHECK_EQ_INT(rc, SQLITE_OK);
    CHECK(!is_overflowed);
    int file_fsyncs = count_events(EVENT_FSYNC, FILE_DATABASE) +
                      count_events(EVENT_FSYNC, FILE_JOURNAL);
    CHECK_EQ_INT(count_type(EVENT_BARRIER) > 0, !is_plain);
    CHECK_EQ_INT(file_fsyncs > 0, is_plain);
    CHECK_EQ_INT(count_type(EVENT_FULL_FLUSH), 0);
    CHECK_EQ_INT(count_type(EVENT_UNEXPECTED_FCNTL), 0);
  }
}

/*
 * A WAL database, which only a plain connection keeps, syncs with barriers
 * too: a barrier orders the log's frames, and its directory entry when the
 * first write creates it, before a checkpoint writes them into the database,
 * and the database's pages before the log starts over, and a header, the
 * log's first and a restarted one, before the frames after it, with
 * synchronous = FULL or NORMAL, and with fullfsync off under
 * checkpoint_fullfsync. A commit to the log ends with a barrier with FULL
 * only, and with fullfsync off, with an fsync().
 */
static void sync_wal_is_ordered_with_barriers(void) {
  CHECK(set_up());
  static const struct {
    const char *pragmas;
    int commits_with_barriers;
    int commits_with_fsyncs;
  } runs[] = {
      {"pragma synchronous = full", 1, 0},
      {"pragma synchronous = normal", 0, 0},
      {"pragma synchronous = full; pragma fullfsync = off; "
       "pragma checkpoint_fullfsync = on",
       0, 1},
  };
  for (size_t r = 0; r < sizeof runs / sizeof runs[0]; r++) {
    char path[512];
    path_of(path, "wal.db");
    remove_database(path);
    sqlite3 *db = NULL;
    evolu_database *database = NULL;
    CHECK_EQ_INT(open_database(path, 1, &db, &database), SQLITE_OK);
    char sql[256];
    snprintf(sql, sizeof sql,
             "pragma journal_mode = wal; pragma wal_autocheckpoint = 0; %s",
             runs[r].pragmas);
    int rc = sqlite3_exec(db, sql, NULL, NULL, NULL);
    start_recording(1);
    // The first write creates the log, the checkpoint copies it into the
    // database, the next write starts the log over, and the last commits to
    // that log.
    if (rc == SQLITE_OK)
      rc = sqlite3_exec(db,
                        "create table t (v text); insert into t values ('y'); "
                        "pragma wal_checkpoint(passive); "
                        "insert into t values ('z'); "
                        "insert into t values ('w')",
                        NULL, NULL, NULL);
    stop_recording();
    int closed = close_database(db, database);
    remove_database(path);
    CHECK_EQ_INT(rc, SQLITE_OK);
    CHECK_EQ_INT(closed, SQLITE_OK);
    CHECK(!is_overflowed);

    // Whether a barrier on the log followed its last write and the directory
    // sync, whether a barrier or an fsync() of the log followed its last
    // write, whether one on the database followed its last write, and whether
    // the log was started over and its last header not yet synced.
    int is_log_ordered = 0;
    int is_log_synced = 0;
    int is_database_ordered = 1;
    int is_restarted = 0;
    int is_header_unsynced = 0;
    int headers = 0;
    int directory_syncs = 0;
    int log_fsyncs = 0;
    int database_writes = 0;
    for (int i = 0; i < event_count; i++) {
      const Event *event = &events[i];
      CHECK(event->type != EVENT_FULL_FLUSH);
      CHECK(event->type != EVENT_UNEXPECTED_FCNTL);
      CHECK(event->type != EVENT_BARRIER || event->file == FILE_WAL ||
            event->file == FILE_DATABASE);
      CHECK(event->type != EVENT_FSYNC || event->file == FILE_DIRECTORY ||
            (runs[r].commits_with_fsyncs && event->file == FILE_WAL));
      if (event->type == EVENT_FSYNC && event->file == FILE_DIRECTORY) {
        CHECK_EQ_INT(event->result, 0);
        directory_syncs++;
        is_log_ordered = 0;
      } else if (event->type == EVENT_FSYNC) {
        CHECK_EQ_INT(event->result, 0);
        log_fsyncs++;
        is_log_synced = 1;
      } else if (event->type == EVENT_BARRIER && event->file == FILE_WAL) {
        is_log_ordered = 1;
        is_log_synced = 1;
        is_header_unsynced = 0;
      } else if (event->type == EVENT_BARRIER &&
                 event->file == FILE_DATABASE) {
        is_database_ordered = 1;
      } else if (event->type == EVENT_WRITE && event->file == FILE_WAL) {
        CHECK(is_database_ordered);
        CHECK(!is_header_unsynced);
        // The first write after the checkpoint starts the log over at its
        // header.
        if (database_writes > 0 && !is_restarted) {
          CHECK_EQ_INT(event->offset, 0);
          is_restarted = 1;
        }
        if (event->offset == 0) {
          headers++;
          is_header_unsynced = 1;
        }
        is_log_ordered = 0;
        is_log_synced = 0;
      } else if (event->type == EVENT_WRITE && event->file == FILE_DATABASE) {
        CHECK(is_log_ordered);
        is_database_ordered = 0;
        database_writes++;
      }
    }
    CHECK_EQ_INT(directory_syncs, 1);
    CHECK(database_writes > 0);
    CHECK(is_restarted);
    CHECK_EQ_INT(headers, 2);
    // How the last commit synced the log.
    CHECK_EQ_INT(is_log_ordered, runs[r].commits_with_barriers);
    CHECK_EQ_INT(is_log_synced,
                 runs[r].commits_with_barriers || runs[r].commits_with_fsyncs);
    CHECK_EQ_INT(log_fsyncs > 0, runs[r].commits_with_fsyncs);
  }
}

static int copy_file(const char *from, const char *to) {
  FILE *input = fopen(from, "rb");
  FILE *output = fopen(to, "wb");
  int ok = input != NULL && output != NULL;
  char buffer[4096];
  size_t size;
  while (ok && (size = fread(buffer, 1, sizeof buffer, input)) > 0)
    ok = fwrite(buffer, 1, size, output) == size;
  if (input != NULL) fclose(input);
  if (output != NULL) ok = fclose(output) == 0 && ok;
  return ok;
}

/*
 * The rollback of a hot journal, which an open runs as it reads the schema,
 * syncs the database with a barrier after it writes the pages back and before
 * it deletes the journal, on a codec file and on a plain file the binding
 * opens, since evolu_core_register turns fullfsync on before that read. On a
 * codec file, the sync of the journal before the playback is a barrier too,
 * and on a plain file an fsync() (Syncs in evolu_codec.h).
 */
static void sync_hot_journal_rollback_is_ordered_with_barriers(void) {
  CHECK(set_up());
  for (int is_plain = 0; is_plain < 2; is_plain++) {
    char path[512];
    char copy[512];
    char journal[600];
    char copy_journal[600];
    path_of(path, "hot.db");
    path_of(copy, "hot-copy.db");
    snprintf(journal, sizeof journal, "%s-journal", path);
    snprintf(copy_journal, sizeof copy_journal, "%s-journal", copy);
    remove_database(copy);
    CHECK_EQ_INT(create_database(path, is_plain, 50), SQLITE_OK);
    sqlite3 *db = NULL;
    evolu_database *database = NULL;
    CHECK_EQ_INT(open_database(path, is_plain, &db, &database), SQLITE_OK);
    // The cache spills, which syncs the journal and writes the database,
    // before the files are copied as a crash would leave them.
    int rc = sqlite3_exec(
        db, "pragma cache_size = 2; begin; update t set v = v || 'z'", NULL,
        NULL, NULL);
    int copied = copy_file(path, copy) && copy_file(journal, copy_journal);
    sqlite3_exec(db, "rollback", NULL, NULL, NULL);
    CHECK_EQ_INT(close_database(db, database), SQLITE_OK);
    remove_database(path);
    CHECK_EQ_INT(rc, SQLITE_OK);
    CHECK(copied);

    start_recording(1);
    rc = open_database(copy, is_plain, &db, &database);
    stop_recording();
    long long original =
        rc == SQLITE_OK
            ? query_int(
                  db, "select count(*) from t where v = printf('%.3000c', 'x')")
            : -1;
    int journal_left = access(copy_journal, F_OK) == 0;
    CHECK_EQ_INT(close_database(db, database), SQLITE_OK);
    remove_database(copy);
    CHECK_EQ_INT(rc, SQLITE_OK);
    CHECK_EQ_INT(original, 50);
    CHECK(!journal_left);
    CHECK(!is_overflowed);
    CHECK_EQ_INT(count_unexpected(is_plain), 0);
    CHECK_EQ_INT(count_events(EVENT_FSYNC, FILE_JOURNAL), is_plain);
    CHECK(is_ordered_by_barriers(!is_plain));
    CHECK_EQ_INT(count_events(EVENT_DELETE, FILE_JOURNAL), 1);
  }
}

/*
 * Where a file system supports no barriers, a commit syncs with full flushes,
 * and where it supports neither, SQLite syncs with fsync(); either way, the
 * commit succeeds.
 */
static void sync_commit_succeeds_without_barriers(void) {
  CHECK(set_up());
  for (int run = 0; run < 4; run++) {
    int is_plain = run / 2;
    int fails_both = run % 2;
    char path[512];
    path_of(path, "fallback.db");
    CHECK_EQ_INT(create_database(path, is_plain, 1), SQLITE_OK);
    sqlite3 *db = NULL;
    evolu_database *database = NULL;
    CHECK_EQ_INT(open_database(path, is_plain, &db, &database), SQLITE_OK);
    start_recording(0);
    fails_barriers = 1;
    fails_full_flushes = fails_both;
    int rc = sqlite3_exec(db, "insert into t values ('y')", NULL, NULL, NULL);
    stop_recording();
    CHECK_EQ_INT(close_database(db, database), SQLITE_OK);
    CHECK_EQ_INT(open_database(path, is_plain, &db, &database), SQLITE_OK);
    long long rows = query_int(db, "select count(*) from t");
    CHECK_EQ_INT(close_database(db, database), SQLITE_OK);
    remove_database(path);
    CHECK_EQ_INT(rc, SQLITE_OK);
    CHECK_EQ_INT(rows, 2);
    CHECK(!is_overflowed);
    CHECK_EQ_INT(count_type(EVENT_UNEXPECTED_FCNTL), 0);
    // Each barrier that failed was followed by a full flush of its file, and
    // each full flush that failed by SQLite's fsync() of it, which succeeded.
    int barriers = 0;
    for (int i = 0; i < event_count; i++) {
      if (events[i].type != EVENT_BARRIER) continue;
      barriers++;
      CHECK(i + 1 + fails_both < event_count);
      CHECK_EQ_INT(events[i + 1].type, EVENT_FULL_FLUSH);
      CHECK_EQ_INT(events[i + 1].fd, events[i].fd);
      if (fails_both) {
        CHECK_EQ_INT(events[i + 2].type, EVENT_FSYNC);
        CHECK_EQ_INT(events[i + 2].fd, events[i].fd);
        CHECK_EQ_INT(events[i + 2].result, 0);
      }
    }
    CHECK(barriers > 0);
    CHECK_EQ_INT(count_events(EVENT_FSYNC, FILE_DATABASE) +
                     count_events(EVENT_FSYNC, FILE_JOURNAL),
                 fails_both ? barriers : 0);
  }
}

/*
 * The bytes SQLite locks for a shared lock, past its pending and reserved
 * bytes at 1 GiB, which another process's SQLite locks for writing to hold an
 * exclusive lock.
 */
#define SHARED_FIRST (0x40000000 + 2)
#define SHARED_SIZE 510

/*
 * Locks pass through the replacement to fcntl intact: a lock another process
 * holds keeps a connection from reading, and F_GETLK reports it.
 */
static void sync_locks_pass_through_to_fcntl(void) {
  CHECK(set_up());
  char path[512];
  path_of(path, "locks.db");
  CHECK_EQ_INT(create_database(path, 0, 1), SQLITE_OK);
  int ready[2];
  int release[2];
  CHECK_EQ_INT(pipe(ready), 0);
  CHECK_EQ_INT(pipe(release), 0);
  pid_t child = fork();
  if (child == 0) {
    // Only async-signal-safe calls after a fork.
    close(ready[0]);
    close(release[1]);
    int fd = open(path, O_RDWR);
    struct flock lock = {.l_type = F_WRLCK,
                         .l_whence = SEEK_SET,
                         .l_start = SHARED_FIRST,
                         .l_len = SHARED_SIZE};
    char locked = fd >= 0 && fcntl(fd, F_SETLK, &lock) == 0 ? '1' : '0';
    char byte;
    if (write(ready[1], &locked, 1) == 1) (void)!read(release[0], &byte, 1);
    _exit(0);
  }
  // Without their write ends, a read sees the end of a pipe whose other
  // process exited.
  close(ready[1]);
  close(release[0]);
  char locked = 0;
  ssize_t ready_size = child > 0 ? read(ready[0], &locked, 1) : 0;
  sqlite3 *db = NULL;
  // The open reads the schema, for which it takes a shared lock.
  start_recording(0);
  int opened_while_locked = evolu_codec_open(path, &db, vfs_name, test_key, 0);
  stop_recording();
  sqlite3_close(db);
  int locks = count_events(EVENT_LOCK, FILE_DATABASE);
  int unexpected = count_unexpected(0);
  // No connection holds the file, so closing fd releases no lock of SQLite's.
  int fd = open(path, O_RDONLY);
  struct flock query = {.l_type = F_RDLCK,
                        .l_whence = SEEK_SET,
                        .l_start = SHARED_FIRST,
                        .l_len = 1};
  int queried = replacement()(fd, F_GETLK, &query);
  close(fd);
  int status = -1;
  if (child > 0) {
    (void)!write(release[1], "x", 1);
    waitpid(child, &status, 0);
  }
  close(ready[0]);
  close(release[1]);
  CHECK(child > 0);
  CHECK_EQ_INT(ready_size, 1);
  CHECK_EQ_INT(locked, '1');
  CHECK_EQ_INT(status, 0);
  CHECK_EQ_INT(opened_while_locked, SQLITE_BUSY);
  CHECK(locks > 0);
  CHECK_EQ_INT(unexpected, 0);
  CHECK_EQ_INT(queried, 0);
  CHECK_EQ_INT(query.l_type, F_WRLCK);
  CHECK_EQ_INT(query.l_pid, child);
  CHECK_EQ_INT(evolu_codec_open(path, &db, vfs_name, test_key, 0), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
  remove_database(path);
}
#endif

/* The temporary directory is empty after the suite, so its removal succeeds. */
static void sync_tests_remove_every_file_they_create(void) {
  CHECK(set_up());
  CHECK_EQ_INT(rmdir(directory), 0);
  directory[0] = '\0';
}

void sync_suite(void) {
  RUN(sync_core_register_turns_fullfsync_on_only_on_apple);
  RUN(sync_core_register_fails_where_an_authorizer_denies_fullfsync);
  RUN(sync_codec_register_replaces_the_unix_fcntl_only_on_apple);
#if defined(__APPLE__)
  RUN(sync_replacement_issues_a_barrier_and_falls_back_to_a_full_flush);
  RUN(sync_commits_are_ordered_with_barriers);
  RUN(sync_shrinking_commit_truncates_after_a_journal_barrier);
  RUN(sync_new_journals_directory_sync_precedes_a_barrier);
  RUN(sync_fullfsync_off_keeps_barriers_only_on_codec_files);
  RUN(sync_wal_is_ordered_with_barriers);
  RUN(sync_hot_journal_rollback_is_ordered_with_barriers);
  RUN(sync_commit_succeeds_without_barriers);
  RUN(sync_locks_pass_through_to_fcntl);
#endif
  RUN(sync_tests_remove_every_file_they_create);
  // Also when a filter skipped that test or it failed.
  if (directory[0] != '\0') remove_directory();
}
