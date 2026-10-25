#include "evolu_skiplist.h"

#include "evolu_crypto.h"

#include <stdint.h>
#include <string.h>

#define TIMESTAMP_SIZE 16
/*
 * The highest level. Storage.ts in @evolu/common draws levels from 1 to 10, so
 * its databases have no higher one, and a node of any other level breaks the
 * invariant.
 */
#define MAX_LEVEL 10
#define FINGERPRINT_SIZE 12
/* A fingerprint and an upper bound for each bucket. */
#define RANGE_SIZE (FINGERPRINT_SIZE + TIMESTAMP_SIZE)
/*
 * More timestamps than an owner can have, so a node counting more breaks the
 * invariant, and sums of the nodes a walk visits never overflow.
 */
#define MAX_COUNT ((sqlite3_int64)1 << 48)

/* A bound past every 16-byte timestamp, which compares less. */
static const uint8_t no_bound[TIMESTAMP_SIZE + 1] = {
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff};

/* The XOR of fingerprints, as two 48-bit halves, and a count. */
typedef struct {
  sqlite3_int64 h1;
  sqlite3_int64 h2;
  sqlite3_int64 c;
} Summary;

static void add_summary(Summary *summary, const Summary *other) {
  summary->h1 ^= other->h1;
  summary->h2 ^= other->h2;
  summary->c += other->c;
}

/* The summary of the timestamps in to and not in from, which to covers. */
static Summary subtract_summary(const Summary *to, const Summary *from) {
  Summary difference = {to->h1 ^ from->h1, to->h2 ^ from->h2, to->c - from->c};
  return difference;
}

/* A node: its timestamp, level and summary. */
typedef struct {
  uint8_t t[TIMESTAMP_SIZE];
  int level;
  Summary summary;
} Node;

/*
 * Where a walk stands: after the node at t, or before every timestamp when
 * is_start. A blob of 0 bytes, which compares less than any other, stands for
 * the start.
 */
typedef struct {
  int is_start;
  uint8_t t[TIMESTAMP_SIZE];
} Position;

/* The statements the functions run, each binding the owner as ?1. */
typedef enum {
  STATEMENT_LEVEL_NODES,
  STATEMENT_NEXT,
  STATEMENT_LEVELS,
  STATEMENT_EXISTS,
  STATEMENT_EXISTS_FROM,
  STATEMENT_INSERT,
  STATEMENT_UPDATE,
  STATEMENT_COUNT
} StatementId;

static const char *const statement_sql[STATEMENT_COUNT] = {
    // A level's nodes after ?3 and before ?4, in order. The level is ?2 + 0,
    // because SQLite's planner reads a bare ?2 = l as a likely 0 or 1 and
    // prepares the statement again whenever a walk reaches level 1 or leaves
    // it.
    "select t, h1, h2, c from evolu_timestamp where ownerId = ?1 and l = ?2 + "
    "0 and t > ?3 and t < ?4 order by t",
    "select t from evolu_timestamp where ownerId = ?1 and t > ?2 order by t "
    "limit 1",
    "select (select max(l) from evolu_timestamp where ownerId = ?1), (select "
    "min(l) from evolu_timestamp where ownerId = ?1)",
    // Whether ?2 exists, the owner's highest level, whether ?2 comes after
    // every timestamp, and the lowest level.
    "select exists (select 1 from evolu_timestamp where ownerId = ?1 and t = "
    "?2), (select max(l) from evolu_timestamp where ownerId = ?1), "
    "ifnull((select max(t) from evolu_timestamp where ownerId = ?1) < ?2, 1), "
    "(select min(l) from evolu_timestamp where ownerId = ?1)",
    "select 1 from evolu_timestamp where ownerId = ?1 and t >= ?2 limit 1",
    "insert into evolu_timestamp (ownerId, t, h1, h2, c, l) values (?1, ?2, "
    "?3, ?4, ?5, ?6)",
    "update evolu_timestamp set h1 = ?3, h2 = ?4, c = ?5 where ownerId = ?1 "
    "and t = ?2",
};

/*
 * The statements of a connection, which its functions share, or of a call
 * that runs while another uses them. Each is prepared when a call first needs
 * it. The connection's client data and each registration of a function hold a
 * reference to the connection's cache, and the last one frees it: the
 * functions stay registered on the zombie that sqlite3_close_v2 leaves while
 * the caller's statements are open, which can still call them.
 */
typedef struct {
  sqlite3_stmt *statements[STATEMENT_COUNT];
  int is_in_use;
  int references;
} Cache;

/* The name of a connection's cache in its client data. */
static const char cache_name[] = "evolu_skiplist";

/* Finalizes a cache's statements, which a later call prepares again. */
static void finalize_statements(Cache *cache) {
  for (int i = 0; i < STATEMENT_COUNT; i++) {
    sqlite3_finalize(cache->statements[i]);
    cache->statements[i] = NULL;
  }
}

/* Releases a reference to a cache, freeing it with the last. */
static void release_cache(void *cache) {
  if (--((Cache *)cache)->references == 0) sqlite3_free(cache);
}

/*
 * The destructor of the connection's client data, which its close runs. It
 * finalizes the statements, which would keep a closing connection open, and
 * leaves the cache in use, so a later call on the zombie prepares statements
 * of its own, which SQLite refuses on a closed connection.
 */
static void close_cache(void *cache) {
  finalize_statements(cache);
  ((Cache *)cache)->is_in_use = 1;
  release_cache(cache);
}

typedef struct {
  sqlite3_context *context;
  sqlite3 *db;
  const void *owner;
  int owner_size;
  // The connection's statements, or own while another call uses those.
  Cache *cache;
  Cache own;
  int has_statements;
} Call;

typedef enum { CALL_OK, CALL_FAILED } CallResult;

/*
 * Resets the connection's statements, so none keeps a read transaction, and
 * releases them, or finalizes the call's own. Their bindings stay, copies the
 * next use binds again: clearing them would make SQLite prepare a statement
 * whose plan read a bound value again.
 */
static void finish_call(Call *call) {
  if (call->cache == &call->own) {
    finalize_statements(&call->own);
    return;
  }
  for (int i = 0; i < STATEMENT_COUNT; i++)
    sqlite3_reset(call->cache->statements[i]);
  call->cache->is_in_use = 0;
}

/* Fails the call with SQLite's error of the connection. */
static CallResult fail_with_sqlite(Call *call, int rc) {
  sqlite3_result_error(call->context, sqlite3_errmsg(call->db), -1);
  sqlite3_result_error_code(call->context, rc);
  return CALL_FAILED;
}

static CallResult fail_corrupt(Call *call) {
  sqlite3_result_error(call->context,
                       "evolu_timestamp breaks the skiplist invariant", -1);
  sqlite3_result_error_code(call->context, SQLITE_CORRUPT);
  return CALL_FAILED;
}

/*
 * Returns a statement with the owner bound as ?1, which every use binds its
 * other parameters on, or NULL, failing the call, when it can't be prepared.
 * The call's first statement takes the connection's statements unless another
 * call uses them. Their parameters are bound as copies, SQLITE_TRANSIENT, so a
 * kept statement never points to a call's memory.
 */
static sqlite3_stmt *use_statement(Call *call, StatementId id) {
  if (!call->has_statements) {
    call->has_statements = 1;
    Cache *shared = sqlite3_user_data(call->context);
    if (!shared->is_in_use) {
      shared->is_in_use = 1;
      call->cache = shared;
    }
  }
  sqlite3_stmt **statement = &call->cache->statements[id];
  if (*statement == NULL) {
    int rc = sqlite3_prepare_v3(call->db, statement_sql[id], -1,
                                SQLITE_PREPARE_PERSISTENT, statement, NULL);
    if (rc != SQLITE_OK) {
      fail_with_sqlite(call, rc);
      return NULL;
    }
  }
  sqlite3_bind_blob(*statement, 1, call->owner, call->owner_size,
                    SQLITE_TRANSIENT);
  return *statement;
}

static void bind_position(sqlite3_stmt *statement, int index,
                          const Position *position) {
  if (position->is_start)
    sqlite3_bind_zeroblob(statement, index, 0);
  else
    sqlite3_bind_blob(statement, index, position->t, TIMESTAMP_SIZE,
                      SQLITE_TRANSIENT);
}

/*
 * Reads a node from a row of t, h1, h2, c starting at column 0, failing for
 * metadata that breaks the invariant.
 */
static CallResult read_node(Call *call, sqlite3_stmt *statement, int level,
                            Node *node) {
  if (sqlite3_column_bytes(statement, 0) != TIMESTAMP_SIZE ||
      sqlite3_column_type(statement, 1) != SQLITE_INTEGER ||
      sqlite3_column_type(statement, 2) != SQLITE_INTEGER ||
      sqlite3_column_type(statement, 3) != SQLITE_INTEGER ||
      sqlite3_column_int64(statement, 3) < 1 ||
      sqlite3_column_int64(statement, 3) > MAX_COUNT)
    return fail_corrupt(call);
  memcpy(node->t, sqlite3_column_blob(statement, 0), TIMESTAMP_SIZE);
  node->level = level;
  node->summary.h1 = sqlite3_column_int64(statement, 1);
  node->summary.h2 = sqlite3_column_int64(statement, 2);
  node->summary.c = sqlite3_column_int64(statement, 3);
  return CALL_OK;
}

/*
 * Starts a walk of the nodes at exactly level after start and before bound,
 * which next_node steps through, returning its statement, or NULL, failing the
 * call.
 */
static sqlite3_stmt *start_level(Call *call, int level, const Position *start,
                                 const uint8_t *bound, int bound_size) {
  sqlite3_stmt *statement = use_statement(call, STATEMENT_LEVEL_NODES);
  if (statement == NULL) return NULL;
  sqlite3_bind_int(statement, 2, level);
  bind_position(statement, 3, start);
  sqlite3_bind_blob(statement, 4, bound, bound_size, SQLITE_TRANSIENT);
  return statement;
}

/* Steps a level's walk to its next node, setting *found. */
static CallResult next_node(Call *call, sqlite3_stmt *statement, int level,
                            Node *node, int *found) {
  int rc = sqlite3_step(statement);
  *found = rc == SQLITE_ROW;
  if (rc == SQLITE_ROW) return read_node(call, statement, level, node);
  if (rc != SQLITE_DONE) return fail_with_sqlite(call, rc);
  return CALL_OK;
}

/*
 * Reads the owner's highest level from a max(l) column and its lowest from a
 * min(l) column, each a scalar subquery the index answers, setting *level to
 * the highest, or 0 for NULL, when it has no timestamps. Fails for any level
 * outside 1 to MAX_LEVEL.
 */
static CallResult read_levels(Call *call, sqlite3_stmt *statement,
                              int max_column, int min_column, int *level) {
  *level = 0;
  if (sqlite3_column_type(statement, max_column) == SQLITE_NULL) return CALL_OK;
  sqlite3_int64 max = sqlite3_column_int64(statement, max_column);
  if (sqlite3_column_type(statement, max_column) != SQLITE_INTEGER ||
      sqlite3_column_type(statement, min_column) != SQLITE_INTEGER ||
      sqlite3_column_int64(statement, min_column) < 1 || max > MAX_LEVEL)
    return fail_corrupt(call);
  *level = (int)max;
  return CALL_OK;
}

/*
 * The owner's highest level, 0 when it has no timestamps. A read function
 * calls it first and leaves its statement stepped until the call finishes, so
 * outside a transaction the connection keeps one read transaction, and the
 * call's statements read one snapshot.
 */
static CallResult max_level_of(Call *call, int *level) {
  sqlite3_stmt *statement = use_statement(call, STATEMENT_LEVELS);
  if (statement == NULL) return CALL_FAILED;
  int rc = sqlite3_step(statement);
  return rc == SQLITE_ROW ? read_levels(call, statement, 0, 1, level)
                          : fail_with_sqlite(call, rc);
}

/*
 * Walks from level top down, adding up the nodes before bound, which
 * compares, as every timestamp does, as a blob. Each level's walk continues
 * from where the level above stopped, so it adds the nodes of exactly that
 * level, whose ranges are contiguous. Sets prefixes[level], when given, to the
 * sum after each level, and *total to the sum of every timestamp before
 * bound.
 */
static CallResult walk_before(Call *call, int top, const uint8_t *bound,
                              int bound_size, Summary *prefixes,
                              Summary *total) {
  Position position = {1, {0}};
  Summary sum = {0, 0, 0};
  for (int level = top; level >= 1; level--) {
    sqlite3_stmt *statement =
        start_level(call, level, &position, bound, bound_size);
    if (statement == NULL) return CALL_FAILED;
    for (;;) {
      Node node;
      int found;
      if (next_node(call, statement, level, &node, &found) != CALL_OK)
        return CALL_FAILED;
      if (!found) break;
      add_summary(&sum, &node.summary);
      if (sum.c > MAX_COUNT) return fail_corrupt(call);
      position.is_start = 0;
      memcpy(position.t, node.t, TIMESTAMP_SIZE);
    }
    sqlite3_reset(statement);
    if (prefixes != NULL) prefixes[level] = sum;
  }
  *total = sum;
  return CALL_OK;
}

/*
 * Walks from level top down, adding up whole nodes while their count stays
 * within limit, at most MAX_COUNT, so the sum never passes it. A node that
 * would pass it bounds the walk of the levels below, whose nodes it covers, so
 * they reach the limit unless its count is wrong, which fails the call. Sets
 * *sum, whose count is less than limit only when the owner has fewer
 * timestamps, and *position, after the last timestamp added.
 */
static CallResult walk_count(Call *call, int top, sqlite3_int64 limit,
                             Summary *sum, Position *position) {
  uint8_t bound[TIMESTAMP_SIZE + 1];
  int bound_size = (int)sizeof no_bound;
  memcpy(bound, no_bound, sizeof no_bound);
  position->is_start = 1;
  memset(sum, 0, sizeof *sum);
  for (int level = top; level >= 1 && sum->c < limit; level--) {
    sqlite3_stmt *statement =
        start_level(call, level, position, bound, bound_size);
    if (statement == NULL) return CALL_FAILED;
    for (;;) {
      Node node;
      int found;
      if (next_node(call, statement, level, &node, &found) != CALL_OK)
        return CALL_FAILED;
      if (!found) break;
      if (sum->c + node.summary.c > limit) {
        memcpy(bound, node.t, TIMESTAMP_SIZE);
        bound_size = TIMESTAMP_SIZE;
        break;
      }
      add_summary(sum, &node.summary);
      position->is_start = 0;
      memcpy(position->t, node.t, TIMESTAMP_SIZE);
      if (sum->c == limit) break;
    }
    sqlite3_reset(statement);
  }
  if (bound_size == TIMESTAMP_SIZE && sum->c < limit) return fail_corrupt(call);
  return CALL_OK;
}

/* Finds the owner's first timestamp after position, setting *found. */
static CallResult next_timestamp(Call *call, const Position *position,
                                 uint8_t t[TIMESTAMP_SIZE], int *found) {
  sqlite3_stmt *statement = use_statement(call, STATEMENT_NEXT);
  if (statement == NULL) return CALL_FAILED;
  bind_position(statement, 2, position);
  int rc = sqlite3_step(statement);
  CallResult result = CALL_OK;
  *found = rc == SQLITE_ROW;
  if (rc == SQLITE_ROW) {
    if (sqlite3_column_bytes(statement, 0) != TIMESTAMP_SIZE)
      result = fail_corrupt(call);
    else
      memcpy(t, sqlite3_column_blob(statement, 0), TIMESTAMP_SIZE);
  } else if (rc != SQLITE_DONE) {
    result = fail_with_sqlite(call, rc);
  }
  sqlite3_reset(statement);
  return result;
}

/* A timestamp's fingerprint as its summary. */
static Summary fingerprint_of(const uint8_t t[TIMESTAMP_SIZE]) {
  uint8_t hash[EVOLU_SHA256_SIZE];
  evolu_sha256_digest(t, TIMESTAMP_SIZE, hash);
  Summary summary = {0, 0, 1};
  for (int i = 0; i < 6; i++) summary.h1 = summary.h1 << 8 | hash[i];
  for (int i = 6; i < FINGERPRINT_SIZE; i++)
    summary.h2 = summary.h2 << 8 | hash[i];
  return summary;
}

static void write_fingerprint(uint8_t out[FINGERPRINT_SIZE],
                              const Summary *summary) {
  for (int i = 0; i < 6; i++) {
    out[i] = (uint8_t)(summary->h1 >> (40 - 8 * i));
    out[6 + i] = (uint8_t)(summary->h2 >> (40 - 8 * i));
  }
}

static int fail_argument(sqlite3_context *context, const char *message) {
  sqlite3_result_error(context, message, -1);
  return 0;
}

/*
 * Starts a call for a 16-byte owner, or fails the context for any other
 * argument.
 *
 * A blob argument's bytes, here and below, are never NULL for a blob that has
 * some: every build omits incremental blobs (SQLITE_OMIT_INCRBLOB), so SQLite
 * writes a zeroblob's zeros when it makes one, and sqlite3_value_blob has
 * nothing to expand.
 */
static int start_call(sqlite3_context *context, sqlite3_value *owner,
                      Call *call) {
  memset(call, 0, sizeof *call);
  call->cache = &call->own;
  if (sqlite3_value_type(owner) != SQLITE_BLOB ||
      sqlite3_value_bytes(owner) != TIMESTAMP_SIZE)
    return fail_argument(context, "the owner must be a 16-byte blob");
  call->context = context;
  call->db = sqlite3_context_db_handle(context);
  call->owner = sqlite3_value_blob(owner);
  call->owner_size = TIMESTAMP_SIZE;
  return 1;
}

/* Copies a 16-byte timestamp argument, or fails the context for another. */
static int read_timestamp(sqlite3_context *context, sqlite3_value *value,
                          uint8_t t[TIMESTAMP_SIZE]) {
  if (sqlite3_value_type(value) != SQLITE_BLOB ||
      sqlite3_value_bytes(value) != TIMESTAMP_SIZE)
    return fail_argument(context, "the timestamp must be a 16-byte blob");
  memcpy(t, sqlite3_value_blob(value), TIMESTAMP_SIZE);
  return 1;
}

/* Runs a statement that changes a row, failing the call on an error. */
static CallResult run_change(Call *call, sqlite3_stmt *statement) {
  int rc = sqlite3_step(statement);
  sqlite3_reset(statement);
  return rc == SQLITE_DONE ? CALL_OK : fail_with_sqlite(call, rc);
}

/*
 * Inserts t at level. The new node's summary is the timestamps after the
 * previous node of its level or higher, up to t. Every node whose range t
 * falls in is the first node after t at its level or higher: one of a higher
 * level than t's adds t, and one of t's level or lower now starts after t, so
 * it loses the timestamps before t that its range held.
 */
static CallResult insert(Call *call, const uint8_t t[TIMESTAMP_SIZE],
                         int level, int *inserted) {
  *inserted = 0;
  // Whether t exists, the owner's highest level, and whether t comes after
  // every timestamp, when it has nothing after it to update.
  sqlite3_stmt *exists_statement = use_statement(call, STATEMENT_EXISTS);
  if (exists_statement == NULL) return CALL_FAILED;
  sqlite3_bind_blob(exists_statement, 2, t, TIMESTAMP_SIZE, SQLITE_TRANSIENT);
  int rc = sqlite3_step(exists_statement);
  if (rc != SQLITE_ROW) {
    sqlite3_reset(exists_statement);
    return fail_with_sqlite(call, rc);
  }
  int exists = sqlite3_column_int(exists_statement, 0);
  int max_level;
  CallResult max_result =
      read_levels(call, exists_statement, 1, 3, &max_level);
  int is_last = sqlite3_column_int(exists_statement, 2);
  sqlite3_reset(exists_statement);
  if (max_result != CALL_OK) return CALL_FAILED;
  if (exists) return CALL_OK;

  // The sums before t after each level's walk, where prefixes[1] covers every
  // timestamp before t, and the levels above the highest have none. A node of
  // level 1 sums only itself, and the nodes it cuts, of level 1, keep theirs,
  // so it needs no walk.
  Summary prefixes[MAX_LEVEL + 1];
  memset(prefixes, 0, sizeof prefixes);
  Summary before;
  if (level > 1 && walk_before(call, max_level, t, TIMESTAMP_SIZE, prefixes,
                               &before) != CALL_OK)
    return CALL_FAILED;
  Summary own = fingerprint_of(t);
  Summary node = subtract_summary(&prefixes[1], &prefixes[level]);
  add_summary(&node, &own);
  // No owner has more timestamps, so a count past the limit, which reads
  // refuse, comes from metadata that breaks the invariant.
  if (node.c > MAX_COUNT) return fail_corrupt(call);

  // The first node after t at each level, then the first at each level or
  // higher.
  Node firsts[MAX_LEVEL + 1];
  int has_first[MAX_LEVEL + 2] = {0};
  Position after_t = {0, {0}};
  memcpy(after_t.t, t, TIMESTAMP_SIZE);
  for (int m = 1; !is_last && m <= max_level; m++) {
    sqlite3_stmt *statement =
        start_level(call, m, &after_t, no_bound, (int)sizeof no_bound);
    if (statement == NULL) return CALL_FAILED;
    CallResult result =
        next_node(call, statement, m, &firsts[m], &has_first[m]);
    sqlite3_reset(statement);
    if (result != CALL_OK) return CALL_FAILED;
  }
  for (int m = max_level - 1; m >= 1; m--)
    if (has_first[m + 1] &&
        (!has_first[m] || memcmp(firsts[m + 1].t, firsts[m].t,
                                 TIMESTAMP_SIZE) < 0)) {
      firsts[m] = firsts[m + 1];
      has_first[m] = 1;
    }

  sqlite3_stmt *insert_statement = use_statement(call, STATEMENT_INSERT);
  if (insert_statement == NULL) return CALL_FAILED;
  sqlite3_bind_blob(insert_statement, 2, t, TIMESTAMP_SIZE, SQLITE_TRANSIENT);
  sqlite3_bind_int64(insert_statement, 3, node.h1);
  sqlite3_bind_int64(insert_statement, 4, node.h2);
  sqlite3_bind_int64(insert_statement, 5, node.c);
  sqlite3_bind_int(insert_statement, 6, level);
  if (run_change(call, insert_statement) != CALL_OK) return CALL_FAILED;

  for (int m = 1; m <= max_level; m++) {
    // The same node is first at consecutive levels. A level with a first node
    // has one at every level below, as the loop above took them.
    if (!has_first[m] ||
        (m > 1 && memcmp(firsts[m - 1].t, firsts[m].t, TIMESTAMP_SIZE) == 0))
      continue;
    Node *first = &firsts[m];
    Summary updated = first->summary;
    if (first->level > level) {
      add_summary(&updated, &own);
    } else {
      Summary lost = subtract_summary(&prefixes[1], &prefixes[first->level]);
      // A node that loses nothing keeps its summary.
      if (lost.c == 0) continue;
      updated = subtract_summary(&updated, &lost);
    }
    if (updated.c < 1 || updated.c > MAX_COUNT) return fail_corrupt(call);
    sqlite3_stmt *update_statement = use_statement(call, STATEMENT_UPDATE);
    if (update_statement == NULL) return CALL_FAILED;
    sqlite3_bind_blob(update_statement, 2, first->t, TIMESTAMP_SIZE,
                      SQLITE_TRANSIENT);
    sqlite3_bind_int64(update_statement, 3, updated.h1);
    sqlite3_bind_int64(update_statement, 4, updated.h2);
    sqlite3_bind_int64(update_statement, 5, updated.c);
    if (run_change(call, update_statement) != CALL_OK) return CALL_FAILED;
  }
  *inserted = 1;
  return CALL_OK;
}

static void insert_function(sqlite3_context *context, int argc,
                            sqlite3_value **argv) {
  (void)argc;
  Call call;
  uint8_t t[TIMESTAMP_SIZE];
  if (!start_call(context, argv[0], &call) ||
      !read_timestamp(context, argv[1], t))
    return;
  if (sqlite3_value_type(argv[2]) != SQLITE_INTEGER ||
      sqlite3_value_int64(argv[2]) < 1 ||
      sqlite3_value_int64(argv[2]) > MAX_LEVEL) {
    fail_argument(context, "the level must be an integer from 1 to 10");
    return;
  }
  // Outside a transaction, each statement insert runs commits on its own, so a
  // crash or an error between them would keep the new row without the updates
  // of the nodes after it, which a retry finds and returns 0 for.
  if (sqlite3_get_autocommit(call.db)) {
    sqlite3_result_error(context,
                         "evolu_skiplist_insert must run in a transaction", -1);
    sqlite3_result_error_code(context, SQLITE_MISUSE);
    return;
  }
  int inserted;
  if (insert(&call, t, (int)sqlite3_value_int64(argv[2]), &inserted) ==
      CALL_OK)
    sqlite3_result_int(context, inserted);
  finish_call(&call);
}

static void size_function(sqlite3_context *context, int argc,
                          sqlite3_value **argv) {
  (void)argc;
  Call call;
  if (!start_call(context, argv[0], &call)) return;
  int top;
  Summary total;
  if (max_level_of(&call, &top) == CALL_OK &&
      walk_before(&call, top, no_bound, (int)sizeof no_bound, NULL, &total) ==
          CALL_OK)
    sqlite3_result_int64(context, total.c);
  finish_call(&call);
}

static void fingerprints_function(sqlite3_context *context, int argc,
                                  sqlite3_value **argv) {
  (void)argc;
  Call call;
  if (!start_call(context, argv[0], &call)) return;
  int size = sqlite3_value_bytes(argv[1]);
  if (sqlite3_value_type(argv[1]) != SQLITE_BLOB || size == 0 ||
      size % 8 != 0) {
    fail_argument(context, "the buckets must be big-endian 8-byte counts");
    return;
  }
  int count = size / 8;
  // The result's size fits an int only within SQLite's length limit.
  if ((sqlite3_int64)count * RANGE_SIZE >
      sqlite3_limit(call.db, SQLITE_LIMIT_LENGTH, -1)) {
    sqlite3_result_error_toobig(context);
    return;
  }
  const uint8_t *buckets = sqlite3_value_blob(argv[1]);
  // Freed by SQLite, or here on a failure.
  uint8_t *ranges = sqlite3_malloc64((sqlite3_uint64)count * RANGE_SIZE);
  if (ranges == NULL) {
    sqlite3_result_error_nomem(context);
    return;
  }
  int top;
  CallResult result = max_level_of(&call, &top);
  Summary previous = {0, 0, 0};
  sqlite3_uint64 previous_bucket = 0;
  for (int i = 0; result == CALL_OK && i < count; i++) {
    sqlite3_uint64 bucket = 0;
    for (int b = 0; b < 8; b++) bucket = bucket << 8 | buckets[i * 8 + b];
    if (bucket < previous_bucket) {
      fail_argument(context, "the buckets must increase");
      result = CALL_FAILED;
      break;
    }
    // No owner has more timestamps, which also keeps the count an int64.
    if (bucket > (sqlite3_uint64)MAX_COUNT) {
      fail_argument(context, "a bucket is past the owner's timestamps");
      result = CALL_FAILED;
      break;
    }
    Summary sum;
    Position position;
    result = walk_count(&call, top, (sqlite3_int64)bucket, &sum, &position);
    if (result != CALL_OK) break;
    if ((sqlite3_uint64)sum.c != bucket) {
      fail_argument(context, "a bucket is past the owner's timestamps");
      result = CALL_FAILED;
      break;
    }
    uint8_t *range = ranges + (size_t)i * RANGE_SIZE;
    Summary fingerprint = subtract_summary(&sum, &previous);
    write_fingerprint(range, &fingerprint);
    int found;
    result = next_timestamp(&call, &position, range + FINGERPRINT_SIZE, &found);
    if (result == CALL_OK && !found)
      memset(range + FINGERPRINT_SIZE, 0, TIMESTAMP_SIZE);
    previous = sum;
    previous_bucket = bucket;
  }
  if (result == CALL_OK)
    sqlite3_result_blob(context, ranges, count * RANGE_SIZE, sqlite3_free);
  else
    sqlite3_free(ranges);
  finish_call(&call);
}

static void lower_bound_function(sqlite3_context *context, int argc,
                                 sqlite3_value **argv) {
  (void)argc;
  Call call;
  uint8_t t[TIMESTAMP_SIZE];
  if (!start_call(context, argv[0], &call) ||
      !read_timestamp(context, argv[1], t))
    return;
  int top;
  sqlite3_stmt *exists_from = NULL;
  if (max_level_of(&call, &top) == CALL_OK)
    exists_from = use_statement(&call, STATEMENT_EXISTS_FROM);
  if (exists_from != NULL) {
    sqlite3_bind_blob(exists_from, 2, t, TIMESTAMP_SIZE, SQLITE_TRANSIENT);
    int rc = sqlite3_step(exists_from);
    sqlite3_reset(exists_from);
    if (rc == SQLITE_DONE) {
      sqlite3_result_null(context);
    } else if (rc != SQLITE_ROW) {
      fail_with_sqlite(&call, rc);
    } else {
      Summary before;
      // The index of the first timestamp at or after t is the number before.
      if (walk_before(&call, top, t, TIMESTAMP_SIZE, NULL, &before) == CALL_OK)
        sqlite3_result_int64(context, before.c);
    }
  }
  finish_call(&call);
}

static void timestamp_at_function(sqlite3_context *context, int argc,
                                  sqlite3_value **argv) {
  (void)argc;
  Call call;
  if (!start_call(context, argv[0], &call)) return;
  if (sqlite3_value_type(argv[1]) != SQLITE_INTEGER ||
      sqlite3_value_int64(argv[1]) < 0) {
    fail_argument(context, "the index must be a non-negative integer");
    return;
  }
  sqlite3_int64 index = sqlite3_value_int64(argv[1]);
  // No owner has MAX_COUNT timestamps, which also keeps index + 1 an int64.
  if (index >= MAX_COUNT) {
    sqlite3_result_null(context);
    return;
  }
  int top;
  Summary sum;
  Position position;
  if (max_level_of(&call, &top) == CALL_OK &&
      walk_count(&call, top, index + 1, &sum, &position) == CALL_OK) {
    // The walk ends on the timestamp at the index when there's one.
    if (sum.c == index + 1)
      sqlite3_result_blob(context, position.t, TIMESTAMP_SIZE,
                          SQLITE_TRANSIENT);
    else
      sqlite3_result_null(context);
  }
  finish_call(&call);
}

static void version_function(sqlite3_context *context, int argc,
                             sqlite3_value **argv) {
  (void)argc;
  (void)argv;
  sqlite3_result_int(context, EVOLU_CORE_VERSION);
}

int evolu_core_register(sqlite3 *db) {
  // It fails only for an option the SQLite doesn't know, and the core compiles
  // against the sqlite3.h that defines it.
  sqlite3_db_config(db, SQLITE_DBCONFIG_DEFENSIVE, 1, (int *)NULL);
  // The functions point to the cache, so a connection registered again keeps
  // its own.
  Cache *cache = sqlite3_get_clientdata(db, cache_name);
  if (cache == NULL) {
    cache = sqlite3_malloc(sizeof *cache);
    if (cache == NULL) return SQLITE_NOMEM;
    memset(cache, 0, sizeof *cache);
    // The client data's reference, which SQLite releases when it can't keep
    // it.
    cache->references = 1;
    int rc = sqlite3_set_clientdata(db, cache_name, cache, close_cache);
    if (rc != SQLITE_OK) return rc;
  }
  static const struct {
    const char *name;
    int argc;
    void (*function)(sqlite3_context *, int, sqlite3_value **);
  } functions[] = {
      {"evolu_skiplist_insert", 3, insert_function},
      {"evolu_skiplist_size", 1, size_function},
      {"evolu_skiplist_fingerprints", 2, fingerprints_function},
      {"evolu_skiplist_lower_bound", 2, lower_bound_function},
      {"evolu_skiplist_timestamp_at", 2, timestamp_at_function},
  };
  for (size_t i = 0; i < sizeof functions / sizeof functions[0]; i++) {
    // The registration's reference, which SQLite releases when the
    // registration fails, a function replaces it or the connection closes.
    cache->references++;
    int rc = sqlite3_create_function_v2(
        db, functions[i].name, functions[i].argc,
        SQLITE_UTF8 | SQLITE_DIRECTONLY, cache, functions[i].function, NULL,
        NULL, release_cache);
    if (rc != SQLITE_OK) return rc;
  }
  return sqlite3_create_function_v2(
      db, "evolu_core_version", 0,
      SQLITE_UTF8 | SQLITE_DETERMINISTIC | SQLITE_INNOCUOUS, NULL,
      version_function, NULL, NULL, NULL);
}

void evolu_skiplist_finalize(sqlite3 *db) {
  Cache *cache = sqlite3_get_clientdata(db, cache_name);
  if (cache != NULL) finalize_statements(cache);
}
