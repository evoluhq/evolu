/*
 * A host build of the SQLCipher that expo-sqlite vendors, keyed as Evolu's
 * expo-sqlite driver keyed it, PRAGMA key = "x'<hex>'", for test/sqlcipher.mts:
 *
 *   fixture create DB KEY ROWS   creates table t with ROWS rows
 *   fixture count DB KEY         prints the original and updated rows of t and
 *                                the first line of PRAGMA integrity_check
 *   fixture crash DB KEY N COPY  runs the update transaction through a VFS
 *                                that copies DB and its journal to COPY and
 *                                COPY-journal before its Nth write and exits
 *                                with status 3, as a power loss would leave
 *                                them; with fewer writes, it commits, prints
 *                                their count and exits with status 0
 *
 * The update transaction spills updated pages into the database before it
 * commits, so a crash leaves a hot journal SQLite must roll back.
 */
#include "sqlite3.h"

// expo-sqlite's copy names most of SQLite's functions and structs exsqlite3_,
// so it never clashes with another SQLite in the app.
#define sqlite3_close exsqlite3_close
#define sqlite3_column_int exsqlite3_column_int
#define sqlite3_column_text exsqlite3_column_text
#define sqlite3_errmsg exsqlite3_errmsg
#define sqlite3_exec exsqlite3_exec
#define sqlite3_file exsqlite3_file
#define sqlite3_finalize exsqlite3_finalize
#define sqlite3_io_methods exsqlite3_io_methods
#define sqlite3_open_v2 exsqlite3_open_v2
#define sqlite3_prepare_v2 exsqlite3_prepare_v2
#define sqlite3_step exsqlite3_step
#define sqlite3_stmt exsqlite3_stmt
#define sqlite3_vfs exsqlite3_vfs
#define sqlite3_vfs_find exsqlite3_vfs_find
#define sqlite3_vfs_register exsqlite3_vfs_register

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static const char update_sql[] =
    "pragma cache_size = 5; begin; update t set v = 'updated' || id; commit";

static void fail(sqlite3 *db, const char *step) {
  fprintf(stderr, "%s: %s\n", step, db == NULL ? "no connection"
                                               : sqlite3_errmsg(db));
  exit(1);
}

static sqlite3 *open_keyed(const char *path, const char *hex_key,
                           const char *vfs) {
  sqlite3 *db = NULL;
  if (sqlite3_open_v2(path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
                      vfs) != SQLITE_OK)
    fail(db, "open");
  char sql[200];
  snprintf(sql, sizeof sql, "PRAGMA key = \"x'%s'\"", hex_key);
  if (sqlite3_exec(db, sql, NULL, NULL, NULL) != SQLITE_OK) fail(db, "key");
  return db;
}

static int copy_file(const char *from, const char *to) {
  FILE *input = fopen(from, "rb");
  if (input == NULL) return 0;
  FILE *output = fopen(to, "wb");
  if (output == NULL) {
    fclose(input);
    return 0;
  }
  char buffer[65536];
  size_t read;
  int ok = 1;
  while ((read = fread(buffer, 1, sizeof buffer, input)) > 0)
    ok = ok && fwrite(buffer, 1, read, output) == read;
  fclose(input);
  return fclose(output) == 0 && ok;
}

/* The crash VFS: forwards to the default VFS and counts writes. */
static sqlite3_vfs *inner_vfs;
static int writes;
static int crash_at;
static const char *crash_database;
static const char *crash_copy;

typedef struct {
  sqlite3_file base;
  sqlite3_file *inner;
} CrashFile;

static int crash_write(sqlite3_file *file, const void *buffer, int amount,
                       sqlite3_int64 offset) {
  if (++writes == crash_at) {
    char journal[1024];
    char copy_journal[1024];
    snprintf(journal, sizeof journal, "%s-journal", crash_database);
    snprintf(copy_journal, sizeof copy_journal, "%s-journal", crash_copy);
    if (!copy_file(crash_database, crash_copy)) _exit(1);
    // The journal may not exist yet.
    unlink(copy_journal);
    if (access(journal, F_OK) == 0 && !copy_file(journal, copy_journal))
      _exit(1);
    _exit(3);
  }
  sqlite3_file *inner = ((CrashFile *)file)->inner;
  return inner->pMethods->xWrite(inner, buffer, amount, offset);
}

#define FORWARD(name, parameters, arguments)                                   \
  static int crash_##name parameters {                                         \
    sqlite3_file *inner = ((CrashFile *)file)->inner;                          \
    return inner->pMethods->x##name arguments;                                 \
  }

FORWARD(Close, (sqlite3_file * file), (inner))
FORWARD(Read,
        (sqlite3_file * file, void *buffer, int amount, sqlite3_int64 offset),
        (inner, buffer, amount, offset))
FORWARD(Truncate, (sqlite3_file * file, sqlite3_int64 size), (inner, size))
FORWARD(Sync, (sqlite3_file * file, int flags), (inner, flags))
FORWARD(FileSize, (sqlite3_file * file, sqlite3_int64 *size), (inner, size))
FORWARD(Lock, (sqlite3_file * file, int level), (inner, level))
FORWARD(Unlock, (sqlite3_file * file, int level), (inner, level))
FORWARD(CheckReservedLock, (sqlite3_file * file, int *result), (inner, result))
FORWARD(FileControl, (sqlite3_file * file, int op, void *arg),
        (inner, op, arg))
FORWARD(SectorSize, (sqlite3_file * file), (inner))
FORWARD(DeviceCharacteristics, (sqlite3_file * file), (inner))

static const sqlite3_io_methods crash_io_methods = {
    1,
    crash_Close,
    crash_Read,
    crash_write,
    crash_Truncate,
    crash_Sync,
    crash_FileSize,
    crash_Lock,
    crash_Unlock,
    crash_CheckReservedLock,
    crash_FileControl,
    crash_SectorSize,
    crash_DeviceCharacteristics,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
};

static int crash_open(sqlite3_vfs *vfs, sqlite3_filename name,
                      sqlite3_file *file, int flags, int *out_flags) {
  (void)vfs;
  CrashFile *crash_file = (CrashFile *)file;
  crash_file->inner = (sqlite3_file *)(crash_file + 1);
  int rc = inner_vfs->xOpen(inner_vfs, name, crash_file->inner, flags,
                            out_flags);
  if (rc != SQLITE_OK) {
    if (crash_file->inner->pMethods != NULL)
      crash_file->inner->pMethods->xClose(crash_file->inner);
    crash_file->base.pMethods = NULL;
    return rc;
  }
  crash_file->base.pMethods = &crash_io_methods;
  return SQLITE_OK;
}

static int register_crash_vfs(void) {
  static sqlite3_vfs vfs;
  inner_vfs = sqlite3_vfs_find(NULL);
  vfs = *inner_vfs;
  vfs.zName = "crash";
  vfs.pNext = NULL;
  vfs.szOsFile = (int)sizeof(CrashFile) + inner_vfs->szOsFile;
  vfs.xOpen = crash_open;
  return sqlite3_vfs_register(&vfs, 0);
}

static void print_count(sqlite3 *db) {
  sqlite3_stmt *statement = NULL;
  if (sqlite3_prepare_v2(
          db,
          "select (select count(*) from t where v like 'evolu-secret-row%'),"
          " (select count(*) from t where v like 'updated%'),"
          " (select integrity_check from pragma_integrity_check limit 1)",
          -1, &statement, NULL) != SQLITE_OK ||
      sqlite3_step(statement) != SQLITE_ROW)
    fail(db, "count");
  printf("%d %d %s\n", sqlite3_column_int(statement, 0),
         sqlite3_column_int(statement, 1),
         (const char *)sqlite3_column_text(statement, 2));
  sqlite3_finalize(statement);
}

int main(int argc, char **argv) {
  if (argc < 4) {
    fprintf(stderr, "usage: fixture create|count|crash DB KEY ...\n");
    return 2;
  }
  const char *command = argv[1];
  const char *path = argv[2];
  const char *hex_key = argv[3];
  if (strcmp(command, "create") == 0 && argc == 5) {
    sqlite3 *db = open_keyed(path, hex_key, NULL);
    char sql[400];
    snprintf(sql, sizeof sql,
             "create table t (id integer primary key, v text);"
             "with recursive n(i) as (select 1 union all select i + 1 from n "
             "where i < %d) insert into t select i, 'evolu-secret-row' || i "
             "|| printf('%%.3000c', 'x') from n",
             atoi(argv[4]));
    if (sqlite3_exec(db, sql, NULL, NULL, NULL) != SQLITE_OK)
      fail(db, "create");
    return sqlite3_close(db) == SQLITE_OK ? 0 : 1;
  }
  if (strcmp(command, "count") == 0 && argc == 4) {
    sqlite3 *db = open_keyed(path, hex_key, NULL);
    print_count(db);
    return sqlite3_close(db) == SQLITE_OK ? 0 : 1;
  }
  if (strcmp(command, "crash") == 0 && argc == 6) {
    if (register_crash_vfs() != SQLITE_OK) fail(NULL, "register");
    crash_at = atoi(argv[4]);
    crash_database = path;
    crash_copy = argv[5];
    sqlite3 *db = open_keyed(path, hex_key, "crash");
    // The writes of the transaction alone.
    writes = 0;
    if (sqlite3_exec(db, update_sql, NULL, NULL, NULL) != SQLITE_OK)
      fail(db, "update");
    printf("%d\n", writes);
    return sqlite3_close(db) == SQLITE_OK ? 0 : 1;
  }
  fprintf(stderr, "unknown command\n");
  return 2;
}
