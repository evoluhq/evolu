/*
 * The skiplist functions of src/evolu_skiplist.h against a brute-force model:
 * random timestamps inserted in ascending, descending and random order with
 * random levels, for two owners at once, after which every node's summary is
 * recomputed from the sorted timestamps and every query is compared with the
 * model. test/skiplist.test.mts compares them with a fixture recorded from
 * Storage.ts's SQL.
 * Test names start with skiplist_, so the suite runs alone with
 * `node packages/sqlite-core/scripts/test.mts skiplist_`.
 */
#include "test.h"

#include "evolu_crypto.h"
#include "evolu_skiplist.h"
#include "sqlite3.h"
#include "sqlite_allocator.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// The table as createBaseSqliteStorageTables in Storage.ts creates it.
static const char create_table_sql[] =
    "create table evolu_timestamp (\"ownerId\" blob not null, \"t\" blob not "
    "null, \"h1\" integer, \"h2\" integer, \"c\" integer, \"l\" integer not "
    "null, primary key (\"ownerId\", \"t\")) strict;"
    "create index evolu_timestamp_index on evolu_timestamp (\"ownerId\", "
    "\"l\", \"t\", \"h1\", \"h2\", \"c\");";

static sqlite3 *open_storage(void) {
  sqlite3 *db = NULL;
  if (sqlite3_open_v2(":memory:", &db,
                      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, NULL) !=
          SQLITE_OK ||
      sqlite3_exec(db, create_table_sql, NULL, NULL, NULL) != SQLITE_OK ||
      evolu_core_register(db) != SQLITE_OK) {
    sqlite3_close(db);
    return NULL;
  }
  return db;
}

/*
 * Finalizes the statements the functions keep, as a binding does before it
 * closes a connection, and closes it.
 */
static int close_storage(sqlite3 *db) {
  evolu_skiplist_finalize(db);
  return sqlite3_close(db);
}

/* xorshift64*, so every run inserts the same timestamps. */
static uint64_t random_state;

static uint64_t next_random(void) {
  random_state ^= random_state >> 12;
  random_state ^= random_state << 25;
  random_state ^= random_state >> 27;
  return random_state * UINT64_C(2685821657736338717);
}

/* A level as Storage.ts draws one: 1, then up while a quarter chance holds. */
static int random_level(void) {
  int level = 1;
  while (next_random() % 4 == 0 && level < 10) level++;
  return level;
}

typedef struct {
  uint8_t t[16];
  int level;
} Entry;

/* An owner's timestamps, sorted, with the levels they were inserted with. */
typedef struct {
  uint8_t owner[16];
  Entry *entries;
  size_t count;
} Model;

static size_t lower_bound_in(const Model *model, const uint8_t *t) {
  size_t low = 0;
  size_t high = model->count;
  while (low < high) {
    size_t middle = (low + high) / 2;
    if (memcmp(model->entries[middle].t, t, 16) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

/* Inserts into the model and returns 1, or returns 0 for an existing one. */
static int insert_into(Model *model, const uint8_t *t, int level) {
  size_t at = lower_bound_in(model, t);
  if (at < model->count && memcmp(model->entries[at].t, t, 16) == 0) return 0;
  memmove(model->entries + at + 1, model->entries + at,
          (model->count - at) * sizeof(Entry));
  memcpy(model->entries[at].t, t, 16);
  model->entries[at].level = level;
  model->count++;
  return 1;
}

/* The two 48-bit halves of a timestamp's fingerprint, as Storage.ts splits it. */
static void fingerprint_of(const uint8_t *t, int64_t *h1, int64_t *h2) {
  uint8_t hash[EVOLU_SHA256_SIZE];
  evolu_sha256_digest(t, 16, hash);
  *h1 = 0;
  *h2 = 0;
  for (int i = 0; i < 6; i++) *h1 = *h1 << 8 | hash[i];
  for (int i = 6; i < 12; i++) *h2 = *h2 << 8 | hash[i];
}

/* XOR of the fingerprints of the model's timestamps at [begin, end). */
static void model_fingerprint(const Model *model, size_t begin, size_t end,
                              uint8_t out[12]) {
  memset(out, 0, 12);
  for (size_t i = begin; i < end; i++) {
    uint8_t hash[EVOLU_SHA256_SIZE];
    evolu_sha256_digest(model->entries[i].t, 16, hash);
    for (int b = 0; b < 12; b++) out[b] ^= hash[b];
  }
}

/*
 * Inserts in a transaction of its own, as evolu_skiplist_insert requires,
 * committed when it succeeds and rolled back when it fails.
 */
static int insert_timestamp(sqlite3 *db, const uint8_t *owner, const uint8_t *t,
                            int level, long long *inserted) {
  int rc = sqlite3_exec(db, "begin", NULL, NULL, NULL);
  if (rc != SQLITE_OK) return rc;
  sqlite3_stmt *statement = NULL;
  rc = sqlite3_prepare_v2(db, "select evolu_skiplist_insert(?, ?, ?)", -1,
                          &statement, NULL);
  if (rc == SQLITE_OK) {
    sqlite3_bind_blob(statement, 1, owner, 16, SQLITE_STATIC);
    sqlite3_bind_blob(statement, 2, t, 16, SQLITE_STATIC);
    sqlite3_bind_int(statement, 3, level);
    rc = sqlite3_step(statement);
    if (rc == SQLITE_ROW) {
      *inserted = sqlite3_column_int64(statement, 0);
      rc = SQLITE_OK;
    }
  }
  sqlite3_finalize(statement);
  int end = sqlite3_exec(db, rc == SQLITE_OK ? "commit" : "rollback", NULL,
                         NULL, NULL);
  return rc == SQLITE_OK ? end : rc;
}

/*
 * Whether every node of an owner holds what the skiplist invariant says: the
 * XOR of the fingerprints and the count of the timestamps after the previous
 * node of the same or a higher level, up to and including it.
 */
static int nodes_match_model(sqlite3 *db, const Model *model) {
  sqlite3_stmt *statement = NULL;
  if (sqlite3_prepare_v2(db,
                         "select t, h1, h2, c, l from evolu_timestamp where "
                         "ownerId = ? order by t",
                         -1, &statement, NULL) != SQLITE_OK)
    return 0;
  sqlite3_bind_blob(statement, 1, model->owner, 16, SQLITE_STATIC);
  size_t i = 0;
  int ok = 1;
  while (ok && sqlite3_step(statement) == SQLITE_ROW) {
    const Entry *entry = &model->entries[i];
    ok = i < model->count && sqlite3_column_bytes(statement, 0) == 16 &&
         memcmp(sqlite3_column_blob(statement, 0), entry->t, 16) == 0 &&
         sqlite3_column_int(statement, 4) == entry->level;
    size_t previous = i;
    while (previous > 0 && model->entries[previous - 1].level < entry->level)
      previous--;
    int64_t h1 = 0;
    int64_t h2 = 0;
    for (size_t j = previous; ok && j <= i; j++) {
      int64_t t1, t2;
      fingerprint_of(model->entries[j].t, &t1, &t2);
      h1 ^= t1;
      h2 ^= t2;
    }
    ok = ok && sqlite3_column_int64(statement, 1) == h1 &&
         sqlite3_column_int64(statement, 2) == h2 &&
         sqlite3_column_int64(statement, 3) == (long long)(i - previous + 1);
    i++;
  }
  sqlite3_finalize(statement);
  return ok && i == model->count;
}

static long long query_owner_int(sqlite3 *db, const char *sql,
                                 const uint8_t *owner, long long argument) {
  sqlite3_stmt *statement = NULL;
  long long value = -2;
  if (sqlite3_prepare_v2(db, sql, -1, &statement, NULL) == SQLITE_OK) {
    sqlite3_bind_blob(statement, 1, owner, 16, SQLITE_STATIC);
    if (sqlite3_bind_parameter_count(statement) > 1)
      sqlite3_bind_int64(statement, 2, argument);
    if (sqlite3_step(statement) == SQLITE_ROW)
      value = sqlite3_column_type(statement, 0) == SQLITE_NULL
                  ? -1
                  : sqlite3_column_int64(statement, 0);
  }
  sqlite3_finalize(statement);
  return value;
}

/* Whether timestamp_at returns every timestamp at its index, NULL past them. */
static int timestamps_at_match_model(sqlite3 *db, const Model *model) {
  sqlite3_stmt *statement = NULL;
  if (sqlite3_prepare_v2(db, "select evolu_skiplist_timestamp_at(?, ?)", -1,
                         &statement, NULL) != SQLITE_OK)
    return 0;
  int ok = 1;
  for (size_t i = 0; ok && i <= model->count; i++) {
    sqlite3_bind_blob(statement, 1, model->owner, 16, SQLITE_STATIC);
    sqlite3_bind_int64(statement, 2, (sqlite3_int64)i);
    ok = sqlite3_step(statement) == SQLITE_ROW;
    if (ok && i < model->count)
      ok = sqlite3_column_bytes(statement, 0) == 16 &&
           memcmp(sqlite3_column_blob(statement, 0), model->entries[i].t,
                  16) == 0;
    else if (ok)
      ok = sqlite3_column_type(statement, 0) == SQLITE_NULL;
    sqlite3_reset(statement);
  }
  sqlite3_finalize(statement);
  return ok;
}

/*
 * Whether fingerprints returns, for random increasing buckets, each range's
 * fingerprint and the timestamp at its bucket, 16 zero bytes at the size.
 */
static int fingerprints_match_model(sqlite3 *db, const Model *model,
                                    int rounds) {
  sqlite3_stmt *statement = NULL;
  if (sqlite3_prepare_v2(db, "select evolu_skiplist_fingerprints(?, ?)", -1,
                         &statement, NULL) != SQLITE_OK)
    return 0;
  int ok = 1;
  for (int round = 0; ok && round < rounds; round++) {
    size_t count = 1 + next_random() % 16;
    uint64_t buckets[16];
    uint8_t encoded[16 * 8];
    for (size_t i = 0; i < count; i++)
      buckets[i] = model->count == 0 ? 0 : next_random() % (model->count + 1);
    // The last bucket is the size, as Storage.ts asks, in every other round.
    if (round % 2 == 0) buckets[count - 1] = model->count;
    for (size_t i = 1; i < count; i++)
      for (size_t j = i; j > 0 && buckets[j - 1] > buckets[j]; j--) {
        uint64_t swap = buckets[j];
        buckets[j] = buckets[j - 1];
        buckets[j - 1] = swap;
      }
    for (size_t i = 0; i < count; i++)
      for (int b = 0; b < 8; b++)
        encoded[i * 8 + (size_t)b] = (uint8_t)(buckets[i] >> (56 - 8 * b));
    sqlite3_bind_blob(statement, 1, model->owner, 16, SQLITE_STATIC);
    sqlite3_bind_blob(statement, 2, encoded, (int)(count * 8), SQLITE_STATIC);
    ok = sqlite3_step(statement) == SQLITE_ROW &&
         sqlite3_column_bytes(statement, 0) == (int)(count * 28);
    const uint8_t *result = sqlite3_column_blob(statement, 0);
    for (size_t i = 0; ok && i < count; i++) {
      uint8_t expected[12];
      model_fingerprint(model, i == 0 ? 0 : buckets[i - 1], buckets[i],
                        expected);
      static const uint8_t zeros[16];
      const uint8_t *upper = buckets[i] < model->count
                                 ? model->entries[buckets[i]].t
                                 : zeros;
      ok = memcmp(result + i * 28, expected, 12) == 0 &&
           memcmp(result + i * 28 + 12, upper, 16) == 0;
    }
    sqlite3_reset(statement);
  }
  sqlite3_finalize(statement);
  return ok;
}

/* Whether lower_bound finds the first timestamp at or after random probes. */
static int lower_bounds_match_model(sqlite3 *db, const Model *model,
                                    int rounds) {
  sqlite3_stmt *statement = NULL;
  if (sqlite3_prepare_v2(db, "select evolu_skiplist_lower_bound(?, ?)", -1,
                         &statement, NULL) != SQLITE_OK)
    return 0;
  int ok = 1;
  for (int round = 0; ok && round < rounds; round++) {
    uint8_t probe[16];
    // Existing timestamps, and random bytes that lie between them.
    if (round % 2 == 0 && model->count > 0)
      memcpy(probe, model->entries[next_random() % model->count].t, 16);
    else
      for (int b = 0; b < 16; b++) probe[b] = (uint8_t)next_random();
    size_t expected = lower_bound_in(model, probe);
    sqlite3_bind_blob(statement, 1, model->owner, 16, SQLITE_STATIC);
    sqlite3_bind_blob(statement, 2, probe, 16, SQLITE_STATIC);
    ok = sqlite3_step(statement) == SQLITE_ROW &&
         (expected == model->count
              ? sqlite3_column_type(statement, 0) == SQLITE_NULL
              : sqlite3_column_int64(statement, 0) == (long long)expected);
    sqlite3_reset(statement);
  }
  sqlite3_finalize(statement);
  return ok;
}

/* Fills a timestamp for the order: ascending, descending or random. */
static void timestamp_for(int order, size_t i, uint8_t t[16]) {
  for (int b = 0; b < 16; b++) t[b] = (uint8_t)next_random();
  if (order == 2) return;
  uint32_t position = order == 0 ? (uint32_t)i : (uint32_t)(0xffffffffu - i);
  t[0] = (uint8_t)(position >> 24);
  t[1] = (uint8_t)(position >> 16);
  t[2] = (uint8_t)(position >> 8);
  t[3] = (uint8_t)position;
}

#define INSERTS 1200

static void skiplist_inserts_keep_every_summary_and_queries_match_brute_force(
    void) {
  for (int order = 0; order < 3; order++) {
    random_state = UINT64_C(0x9e3779b97f4a7c15) + (uint64_t)order;
    sqlite3 *db = open_storage();
    CHECK(db != NULL);
    Model models[2];
    for (int m = 0; m < 2; m++) {
      memset(models[m].owner, 0xa0 + m, 16);
      models[m].entries = calloc(INSERTS, sizeof(Entry));
      models[m].count = 0;
    }
    int ok = models[0].entries != NULL && models[1].entries != NULL;
    for (size_t i = 0; ok && i < INSERTS * 2; i++) {
      Model *model = &models[i % 2];
      uint8_t t[16];
      timestamp_for(order, i / 2, t);
      int level = random_level();
      long long inserted = -1;
      ok = insert_timestamp(db, model->owner, t, level, &inserted) ==
               SQLITE_OK &&
           inserted == insert_into(model, t, level);
      if (ok && i % 400 == 399) ok = nodes_match_model(db, model);
    }
    for (int m = 0; ok && m < 2; m++) {
      const Model *model = &models[m];
      ok = nodes_match_model(db, model) &&
           query_owner_int(db, "select evolu_skiplist_size(?)", model->owner,
                           0) == (long long)model->count &&
           timestamps_at_match_model(db, model) &&
           fingerprints_match_model(db, model, 40) &&
           lower_bounds_match_model(db, model, 400);
    }
    free(models[0].entries);
    free(models[1].entries);
    ok &= close_storage(db) == SQLITE_OK;
    if (!ok) {
      char message[64];
      snprintf(message, sizeof message, "order %d", order);
      test_fail(__FILE__, __LINE__, message);
      return;
    }
  }
}

/*
 * Many small skiplists, checked against the model after every insert, so
 * every shape of few nodes is met: levels up to 10, timestamps before, after
 * and between the others, and duplicates.
 */
static void skiplist_small_random_skiplists_match_brute_force_after_every_insert(
    void) {
  for (uint64_t seed = 1; seed <= 300; seed++) {
    random_state = seed * UINT64_C(0x9e3779b97f4a7c15);
    sqlite3 *db = open_storage();
    CHECK(db != NULL);
    Model model;
    memset(model.owner, 0x5a, 16);
    model.entries = calloc(40, sizeof(Entry));
    model.count = 0;
    int ok = model.entries != NULL;
    size_t inserts = 1 + next_random() % 40;
    for (size_t i = 0; ok && i < inserts; i++) {
      uint8_t t[16];
      // A few values, so timestamps collide, at levels up to 10.
      memset(t, 0, sizeof t);
      t[0] = (uint8_t)(next_random() % 64);
      int level = 1 + (int)(next_random() % 10);
      long long inserted = -1;
      ok = insert_timestamp(db, model.owner, t, level, &inserted) == SQLITE_OK &&
           inserted == insert_into(&model, t, level) &&
           nodes_match_model(db, &model) &&
           query_owner_int(db, "select evolu_skiplist_size(?)", model.owner,
                           0) == (long long)model.count &&
           timestamps_at_match_model(db, &model) &&
           fingerprints_match_model(db, &model, 3) &&
           lower_bounds_match_model(db, &model, 6);
    }
    free(model.entries);
    ok &= close_storage(db) == SQLITE_OK;
    if (!ok) {
      char message[64];
      snprintf(message, sizeof message, "seed %llu", (unsigned long long)seed);
      test_fail(__FILE__, __LINE__, message);
      return;
    }
  }
}

static void skiplist_insert_of_an_existing_timestamp_changes_nothing(void) {
  sqlite3 *db = open_storage();
  CHECK(db != NULL);
  uint8_t owner[16];
  memset(owner, 1, sizeof owner);
  random_state = 42;
  for (int i = 0; i < 50; i++) {
    uint8_t t[16];
    timestamp_for(2, (size_t)i, t);
    long long inserted;
    CHECK_EQ_INT(insert_timestamp(db, owner, t, random_level(), &inserted),
                 SQLITE_OK);
  }
  uint8_t t[16];
  timestamp_for(2, 0, t);
  long long inserted;
  CHECK_EQ_INT(insert_timestamp(db, owner, t, 3, &inserted), SQLITE_OK);
  CHECK_EQ_INT(inserted, 1);
  sqlite3_stmt *statement = NULL;
  CHECK_EQ_INT(sqlite3_prepare_v2(db,
                                  "select group_concat(hex(t) || h1 || h2 || "
                                  "c || l, ',') from (select * from "
                                  "evolu_timestamp order by t)",
                                  -1, &statement, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_step(statement), SQLITE_ROW);
  char *before = sqlite3_mprintf("%s", sqlite3_column_text(statement, 0));
  sqlite3_reset(statement);
  // Again with another level, and with the same.
  CHECK_EQ_INT(insert_timestamp(db, owner, t, 1, &inserted), SQLITE_OK);
  CHECK_EQ_INT(inserted, 0);
  CHECK_EQ_INT(insert_timestamp(db, owner, t, 3, &inserted), SQLITE_OK);
  CHECK_EQ_INT(inserted, 0);
  CHECK_EQ_INT(sqlite3_step(statement), SQLITE_ROW);
  int same = strcmp(before, (const char *)sqlite3_column_text(statement, 0));
  sqlite3_free(before);
  sqlite3_finalize(statement);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
  CHECK_EQ_INT(same, 0);
}

static void skiplist_empty_owner_has_no_timestamps(void) {
  sqlite3 *db = open_storage();
  CHECK(db != NULL);
  uint8_t owner[16] = {0};
  CHECK_EQ_INT(query_owner_int(db, "select evolu_skiplist_size(?)", owner, 0),
               0);
  CHECK_EQ_INT(query_owner_int(db, "select evolu_skiplist_timestamp_at(?, ?)",
                               owner, 0),
               -1);
  CHECK_EQ_INT(query_owner_int(db,
                               "select length(evolu_skiplist_fingerprints(?, "
                               "zeroblob(8)))",
                               owner, 0),
               28);
  CHECK_EQ_INT(query_owner_int(db,
                               "select evolu_skiplist_lower_bound(?, "
                               "zeroblob(16))",
                               owner, 0),
               -1);
  // No owner has 2^48 timestamps, so no index from there on has one.
  CHECK_EQ_INT(query_owner_int(db, "select evolu_skiplist_timestamp_at(?, ?)",
                               owner, 281474976710656LL),
               -1);
  CHECK_EQ_INT(query_owner_int(db, "select evolu_skiplist_timestamp_at(?, ?)",
                               owner, INT64_MAX),
               -1);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
}

/*
 * A node after the new timestamp that loses nothing keeps its row, which a
 * trigger refusing every update proves.
 */
static void skiplist_insert_leaves_successors_that_lose_nothing_unwritten(
    void) {
  sqlite3 *db = open_storage();
  CHECK(db != NULL);
  Model model;
  memset(model.owner, 0, sizeof model.owner);
  Entry entries[4];
  model.entries = entries;
  model.count = 0;
  static const uint8_t timestamps[4] = {1, 3, 2, 0};
  static const int levels[4] = {1, 1, 1, 2};
  long long inserted;
  for (int i = 0; i < 2; i++) {
    uint8_t t[16] = {timestamps[i]};
    CHECK_EQ_INT(insert_timestamp(db, model.owner, t, levels[i], &inserted),
                 SQLITE_OK);
    insert_into(&model, t, levels[i]);
  }
  CHECK_EQ_INT(sqlite3_exec(db,
                            "create trigger refuse before update on "
                            "evolu_timestamp begin select raise(abort, "
                            "'refused'); end",
                            NULL, NULL, NULL),
               SQLITE_OK);

  // {2} at level 1 before {3}, of level 1, and {0} at level 2 before {1},
  // which ranges over nothing before {0}.
  for (int i = 2; i < 4; i++) {
    uint8_t t[16] = {timestamps[i]};
    CHECK_EQ_INT(insert_timestamp(db, model.owner, t, levels[i], &inserted),
                 SQLITE_OK);
    CHECK_EQ_INT(inserted, 1);
    insert_into(&model, t, levels[i]);
  }
  CHECK(nodes_match_model(db, &model));
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
}

/* Returns the error message running sql gives, or NULL when it succeeds. */
static char *error_of(sqlite3 *db, const char *sql) {
  char *message = NULL;
  if (sqlite3_exec(db, sql, NULL, NULL, &message) == SQLITE_OK) return NULL;
  return message;
}

static void skiplist_functions_refuse_malformed_arguments(void) {
  sqlite3 *db = open_storage();
  CHECK(db != NULL);
  // In a transaction, so insert's refusal of autocommit doesn't stand in for
  // an argument check.
  CHECK_EQ_INT(sqlite3_exec(db, "begin", NULL, NULL, NULL), SQLITE_OK);
  CHECK(error_of(db, "select evolu_skiplist_insert(zeroblob(16), "
                     "zeroblob(16), 1)") == NULL);
  static const char owner[] = "the owner must be a 16-byte blob";
  static const char timestamp[] = "the timestamp must be a 16-byte blob";
  static const char level[] = "the level must be an integer from 1 to 10";
  static const char index[] = "the index must be a non-negative integer";
  static const char counts[] = "the buckets must be big-endian 8-byte counts";
  static const char increase[] = "the buckets must increase";
  static const char past[] = "a bucket is past the owner's timestamps";
  static const struct {
    const char *sql;
    const char *message;
  } refused[] = {
      // The timestamp is 16 bytes, the level from 1 to 10, the owner 16 bytes.
      {"select evolu_skiplist_insert(zeroblob(16), zeroblob(15), 1)",
       timestamp},
      {"select evolu_skiplist_insert(zeroblob(16), zeroblob(17), 1)",
       timestamp},
      {"select evolu_skiplist_insert(zeroblob(16), 'text', 1)", timestamp},
      {"select evolu_skiplist_insert(zeroblob(16), randomblob(16), 0)", level},
      {"select evolu_skiplist_insert(zeroblob(16), randomblob(16), 11)", level},
      {"select evolu_skiplist_insert(zeroblob(16), randomblob(16), '1')",
       level},
      {"select evolu_skiplist_insert('owner', randomblob(16), 1)", owner},
      {"select evolu_skiplist_insert(x'', randomblob(16), 1)", owner},
      {"select evolu_skiplist_insert(zeroblob(15), randomblob(16), 1)", owner},
      {"select evolu_skiplist_size(null)", owner},
      {"select evolu_skiplist_size(zeroblob(17))", owner},
      {"select evolu_skiplist_fingerprints(null, x'0000000000000000')", owner},
      {"select evolu_skiplist_lower_bound(zeroblob(15), zeroblob(16))", owner},
      {"select evolu_skiplist_timestamp_at(x'', 0)", owner},
      // Text of the right length isn't a blob.
      {"select evolu_skiplist_size('0123456789abcdef')", owner},
      {"select evolu_skiplist_lower_bound(zeroblob(16), '0123456789abcdef')",
       timestamp},
      {"select evolu_skiplist_fingerprints(zeroblob(16), '00000000')", counts},
      // An index is a non-negative integer.
      {"select evolu_skiplist_timestamp_at(zeroblob(16), -1)", index},
      {"select evolu_skiplist_timestamp_at(zeroblob(16), 1.5)", index},
      // Buckets are big-endian 8-byte counts, increasing, at most the size.
      {"select evolu_skiplist_fingerprints(zeroblob(16), zeroblob(7))", counts},
      {"select evolu_skiplist_fingerprints(zeroblob(16), zeroblob(0))", counts},
      {"select evolu_skiplist_fingerprints(zeroblob(16), x'0000000000000002')",
       past},
      {"select evolu_skiplist_fingerprints(zeroblob(16), x'8000000000000000')",
       past},
      // Parenthesized, so the compiler takes the concatenation as meant.
      {("select evolu_skiplist_fingerprints(zeroblob(16), x'0000000000000001"
        "0000000000000000')"),
       increase},
      {"select evolu_skiplist_lower_bound(zeroblob(16), zeroblob(15))",
       timestamp},
  };
  for (size_t i = 0; i < sizeof refused / sizeof refused[0]; i++) {
    char *message = error_of(db, refused[i].sql);
    int is_refused =
        message != NULL && strcmp(message, refused[i].message) == 0;
    sqlite3_free(message);
    if (!is_refused) {
      test_fail(__FILE__, __LINE__, refused[i].sql);
      close_storage(db);
      return;
    }
  }
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
}

static void skiplist_insert_runs_only_in_a_transaction(void) {
  sqlite3 *db = open_storage();
  CHECK(db != NULL);
  static const char sql[] =
      "select evolu_skiplist_insert(zeroblob(16), zeroblob(16), 1)";
  CHECK_EQ_INT(sqlite3_exec(db, sql, NULL, NULL, NULL), SQLITE_MISUSE);
  CHECK(strcmp(sqlite3_errmsg(db),
               "evolu_skiplist_insert must run in a transaction") == 0);
  uint8_t owner[16] = {0};
  static const char count_sql[] =
      "select count(*) from evolu_timestamp where ownerId = ?";
  CHECK_EQ_INT(query_owner_int(db, count_sql, owner, 0), 0);
  CHECK_EQ_INT(sqlite3_exec(db, "begin", NULL, NULL, NULL), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db, sql, NULL, NULL, NULL), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db, "commit", NULL, NULL, NULL), SQLITE_OK);
  CHECK_EQ_INT(query_owner_int(db, count_sql, owner, 0), 1);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
}

static void skiplist_insert_fails_with_the_error_of_its_statements(void) {
  sqlite3 *db = open_storage();
  CHECK(db != NULL);
  uint8_t owner[16] = {0};
  uint8_t after[16] = {2};
  uint8_t t[16] = {1};
  static const char count_sql[] =
      "select count(*) from evolu_timestamp where ownerId = ?";
  long long inserted;
  // A node of a higher level after t, which inserting t updates.
  CHECK_EQ_INT(insert_timestamp(db, owner, after, 2, &inserted), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db,
                            "create trigger refuse before update on "
                            "evolu_timestamp begin select raise(abort, "
                            "'refused'); end",
                            NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(insert_timestamp(db, owner, t, 1, &inserted),
               SQLITE_CONSTRAINT);
  CHECK_EQ_INT(query_owner_int(db, count_sql, owner, 0), 1);
  CHECK_EQ_INT(sqlite3_exec(db, "drop trigger refuse", NULL, NULL, NULL),
               SQLITE_OK);
  // The insert itself fails.
  CHECK_EQ_INT(sqlite3_exec(db, "pragma query_only = 1", NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(insert_timestamp(db, owner, t, 1, &inserted), SQLITE_READONLY);
  CHECK_EQ_INT(query_owner_int(db, count_sql, owner, 0), 1);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
}

static void skiplist_fingerprints_refuse_a_result_past_the_length_limit(void) {
  sqlite3 *db = open_storage();
  CHECK(db != NULL);
  sqlite3_stmt *statement = NULL;
  CHECK_EQ_INT(sqlite3_prepare_v2(db,
                                  "select evolu_skiplist_fingerprints("
                                  "zeroblob(16), x'00000000000000010000000000"
                                  "0000010000000000000001000000000000000"
                                  "1')",
                                  -1, &statement, NULL),
               SQLITE_OK);
  // After preparing, whose SQL is longer. Four records take 112 bytes, a byte
  // more than this, refused before any bucket is read, so also before these,
  // past the empty owner's size, are.
  sqlite3_limit(db, SQLITE_LIMIT_LENGTH, 111);
  int rc = sqlite3_step(statement);
  sqlite3_finalize(statement);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
  CHECK_EQ_INT(rc, SQLITE_TOOBIG);
}

static void skiplist_functions_run_only_from_top_level_sql(void) {
  sqlite3 *db = open_storage();
  CHECK(db != NULL);
  CHECK_EQ_INT(sqlite3_exec(db,
                            "create view sizes as select "
                            "evolu_skiplist_size(zeroblob(16)) as size",
                            NULL, NULL, NULL),
               SQLITE_OK);
  char *message = error_of(db, "select * from sizes");
  int is_refused = message != NULL && strstr(message, "unsafe use") != NULL;
  sqlite3_free(message);
  CHECK(is_refused);
  CHECK_EQ_INT(query_owner_int(db, "select evolu_core_version() + 0 * length(?)",
                               (const uint8_t *)"0123456789abcdef", 0),
               EVOLU_CORE_VERSION);
  // evolu_core_version is innocuous, so a view calls it even when the schema
  // isn't trusted.
  CHECK_EQ_INT(sqlite3_exec(db,
                            "pragma trusted_schema = off; create view version "
                            "as select evolu_core_version() as v",
                            NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(query_owner_int(db, "select v + 0 * length(?) from version",
                               (const uint8_t *)"0123456789abcdef", 0),
               EVOLU_CORE_VERSION);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
}

/* Counts the commits another connection gets in between a read's statements. */
typedef struct {
  sqlite3 *other;
  int statements;
  int commits;
} Writer;

/*
 * Before each statement a skiplist function runs after its first, another
 * connection to the same database tries to commit a timestamp of the owner.
 */
static int write_between_statements(unsigned type, void *context,
                                    void *statement, void *sql) {
  (void)type;
  (void)statement;
  Writer *writer = context;
  // SQLite traces a statement that a function runs with "-- " before its SQL.
  if (strncmp(sql, "-- ", 3) != 0 || writer->statements++ == 0) return 0;
  char insert[128];
  snprintf(insert, sizeof insert,
           "insert into evolu_timestamp values (zeroblob(16), x'ff%030x', 0, "
           "0, 1, 1)",
           (unsigned)writer->statements);
  if (sqlite3_exec(writer->other, insert, NULL, NULL, NULL) == SQLITE_OK)
    writer->commits++;
  return 0;
}

static void skiplist_reads_outside_a_transaction_read_one_snapshot(void) {
  // A memdb database whose name starts with a slash is shared, with locks, by
  // the connections of the process.
  static const char path[] = "file:/skiplist-snapshot?vfs=memdb";
  int flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI;
  sqlite3 *db = NULL;
  Writer writer = {NULL, 0, 0};
  CHECK_EQ_INT(sqlite3_open_v2(path, &db, flags, NULL), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_open_v2(path, &writer.other, flags, NULL), SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db, create_table_sql, NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(evolu_core_register(db), SQLITE_OK);
  uint8_t owner[16] = {0};
  for (int i = 0; i < 100; i++) {
    uint8_t t[16] = {0};
    t[15] = (uint8_t)(i + 1);
    long long inserted;
    CHECK_EQ_INT(insert_timestamp(db, owner, t,
                                  1 + (i % 4 == 0) + (i % 16 == 0), &inserted),
                 SQLITE_OK);
  }
  CHECK_EQ_INT(sqlite3_trace_v2(db, SQLITE_TRACE_STMT,
                                write_between_statements, &writer),
               SQLITE_OK);
  static const char *const reads[] = {
      "select evolu_skiplist_size(zeroblob(16))",
      "select evolu_skiplist_timestamp_at(zeroblob(16), 90)",
      "select evolu_skiplist_fingerprints(zeroblob(16), x'0000000000000050')",
      ("select evolu_skiplist_lower_bound(zeroblob(16), "
       "x'00000000000000000000000000000050')"),
  };
  int each_ran_more = 1;
  for (size_t i = 0; i < sizeof reads / sizeof reads[0]; i++) {
    writer.statements = 0;
    each_ran_more &=
        sqlite3_exec(db, reads[i], NULL, NULL, NULL) == SQLITE_OK &&
        writer.statements > 1;
  }
  sqlite3_trace_v2(db, 0, NULL, NULL);
  int closed = close_storage(writer.other) == SQLITE_OK &&
               close_storage(db) == SQLITE_OK;
  CHECK(closed);
  CHECK(each_ran_more);
  // No commit got in between the statements of a read.
  CHECK_EQ_INT(writer.commits, 0);
}

/*
 * Opens a storage with owner 0's timestamps {1} and {3} at the levels given,
 * then runs a break over the table.
 */
static sqlite3 *open_broken_storage(int level_1, int level_3,
                                    const char *break_sql) {
  sqlite3 *db = open_storage();
  uint8_t owner[16] = {0};
  uint8_t t1[16] = {1};
  uint8_t t3[16] = {3};
  long long inserted;
  if (db == NULL || insert_timestamp(db, owner, t1, level_1, &inserted) !=
                        SQLITE_OK ||
      insert_timestamp(db, owner, t3, level_3, &inserted) != SQLITE_OK ||
      sqlite3_exec(db, break_sql, NULL, NULL, NULL) != SQLITE_OK) {
    sqlite3_close(db);
    return NULL;
  }
  return db;
}

/* Runs sql for owner 0 in a transaction it rolls back, returning its result. */
static int run_for_owner(sqlite3 *db, const char *sql) {
  uint8_t owner[16] = {0};
  sqlite3_stmt *statement = NULL;
  int rc = sqlite3_exec(db, "begin", NULL, NULL, NULL);
  if (rc == SQLITE_OK) rc = sqlite3_prepare_v2(db, sql, -1, &statement, NULL);
  if (rc == SQLITE_OK) {
    sqlite3_bind_blob(statement, 1, owner, 16, SQLITE_STATIC);
    rc = sqlite3_step(statement);
  }
  sqlite3_finalize(statement);
  sqlite3_exec(db, "rollback", NULL, NULL, NULL);
  return rc;
}

static void skiplist_functions_fail_with_corrupt_on_broken_metadata(void) {
  // Counts below 1, missing summaries, a count no table could reach, levels
  // outside 1 to 10, and a timestamp of another size.
  static const char *const breaks[] = {
      "update evolu_timestamp set c = 0",
      "update evolu_timestamp set h1 = null",
      "update evolu_timestamp set h2 = null",
      "update evolu_timestamp set c = null",
      "update evolu_timestamp set c = 4611686018427387904",
      "update evolu_timestamp set l = 11",
      "update evolu_timestamp set l = -1",
      "update evolu_timestamp set l = 0",
      "update evolu_timestamp set t = substr(t, 1, 15)",
  };
  // Each reads timestamp {1}: a walk of every node, of the first, and before
  // {2}, which finds {3} at or after it, and an insert before both.
  static const char *const reads[] = {
      "select evolu_skiplist_size(?)",
      "select evolu_skiplist_timestamp_at(?, 0)",
      "select evolu_skiplist_fingerprints(?, x'0000000000000001')",
      ("select evolu_skiplist_lower_bound(?, "
       "x'02000000000000000000000000000000')"),
      "select evolu_skiplist_insert(?, zeroblob(16), 2)",
  };
  for (size_t i = 0; i < sizeof breaks / sizeof breaks[0]; i++)
    for (size_t j = 0; j < sizeof reads / sizeof reads[0]; j++) {
      sqlite3 *db = open_broken_storage(1, 1, breaks[i]);
      CHECK(db != NULL);
      int rc = run_for_owner(db, reads[j]);
      int closed = close_storage(db);
      if (rc != SQLITE_CORRUPT || closed != SQLITE_OK) {
        char message[256];
        snprintf(message, sizeof message, "%s, then %s: %d, closed %d",
                 breaks[i], reads[j], rc, closed);
        test_fail(__FILE__, __LINE__, message);
        return;
      }
    }

  static const struct {
    int level_1;
    int level_3;
    const char *break_sql;
    const char *sql;
  } cases[] = {
      // {3} at level 2 counts {1} and itself; inserting {2} at level 2 takes
      // {1} from it, leaving nothing of a count of 1.
      {1, 2, "update evolu_timestamp set c = 1 where l = 2",
       "select evolu_skiplist_insert(?, x'02000000000000000000000000000000', "
       "2)"},
      // Bucket 0 reads no node, only the timestamp at index 0.
      {1, 1, "update evolu_timestamp set t = substr(t, 1, 15)",
       "select evolu_skiplist_fingerprints(?, x'0000000000000000')"},
      // A count one too high: the walk stops before {3}, whose count says a
      // timestamp lies between it and {1}, and finds none there.
      {1, 1,
       "update evolu_timestamp set c = 2 where t = "
       "x'03000000000000000000000000000000'",
       "select evolu_skiplist_timestamp_at(?, 1)"},
      {1, 1,
       "update evolu_timestamp set c = 2 where t = "
       "x'03000000000000000000000000000000'",
       "select evolu_skiplist_fingerprints(?, x'0000000000000002')"},
      // One node below level 1, which no walk visits, among valid ones.
      {2, 1,
       "update evolu_timestamp set l = 0 where t = "
       "x'03000000000000000000000000000000'",
       "select evolu_skiplist_size(?)"},
      {2, 1,
       "update evolu_timestamp set l = 0 where t = "
       "x'03000000000000000000000000000000'",
       "select evolu_skiplist_insert(?, x'02000000000000000000000000000000', "
       "1)"},
      // Counts each within the limit, whose sum isn't.
      {1, 1, "update evolu_timestamp set c = 281474976710656",
       "select evolu_skiplist_size(?)"},
      // A count at the limit, which an insert would pass: {2} at level 2
      // sums {1} and itself, and {3} at level 2 gains {2}.
      {1, 1,
       "update evolu_timestamp set c = 281474976710656 where t = "
       "x'01000000000000000000000000000000'",
       "select evolu_skiplist_insert(?, x'02000000000000000000000000000000', "
       "2)"},
      {1, 2, "update evolu_timestamp set c = 281474976710656 where l = 2",
       "select evolu_skiplist_insert(?, x'02000000000000000000000000000000', "
       "1)"},
  };
  // An insert that fails on corrupt metadata after writing its row leaves a
  // transaction SQLite refuses to commit, so the row is never committed.
  sqlite3 *corrupt = open_broken_storage(
      1, 2, "update evolu_timestamp set c = 1 where l = 2");
  CHECK(corrupt != NULL);
  CHECK_EQ_INT(sqlite3_exec(corrupt,
                            "begin; select evolu_skiplist_insert(zeroblob(16), "
                            "x'02000000000000000000000000000000', 2)",
                            NULL, NULL, NULL),
               SQLITE_CORRUPT);
  CHECK_EQ_INT(sqlite3_exec(corrupt, "commit", NULL, NULL, NULL),
               SQLITE_CORRUPT);
  uint8_t corrupt_owner[16] = {0};
  CHECK_EQ_INT(query_owner_int(corrupt,
                               "select count(*) from evolu_timestamp where "
                               "ownerId = ?",
                               corrupt_owner, 0),
               2);
  CHECK_EQ_INT(close_storage(corrupt), SQLITE_OK);

  // No index from 2^48 on is walked, so counts each within the limit, whose
  // sum isn't, never give a timestamp there.
  sqlite3 *broken = open_broken_storage(
      1, 1, "update evolu_timestamp set c = 281474976710656");
  CHECK(broken != NULL);
  uint8_t owner[16] = {0};
  CHECK_EQ_INT(query_owner_int(broken,
                               "select evolu_skiplist_timestamp_at(?, ?)",
                               owner, 281474976710656LL),
               -1);
  // Nor is any bucket past 2^48 walked.
  char *message = error_of(broken, "select evolu_skiplist_fingerprints("
                                   "zeroblob(16), x'0002000000000000')");
  int is_past = message != NULL &&
                strcmp(message, "a bucket is past the owner's timestamps") == 0;
  sqlite3_free(message);
  CHECK_EQ_INT(close_storage(broken), SQLITE_OK);
  CHECK(is_past);

  for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++) {
    sqlite3 *db =
        open_broken_storage(cases[i].level_1, cases[i].level_3,
                            cases[i].break_sql);
    CHECK(db != NULL);
    int rc = run_for_owner(db, cases[i].sql);
    int closed = close_storage(db);
    if (rc != SQLITE_CORRUPT || closed != SQLITE_OK) {
      test_fail(__FILE__, __LINE__, cases[i].sql);
      return;
    }
  }
}

/*
 * Counts exactly at the limit pass every check: a node, a sum, a bucket and
 * an index below 2^48, and a result of exactly SQLite's length limit.
 */
static void skiplist_functions_accept_counts_at_the_limit(void) {
  uint8_t owner[16] = {0};
  // {3} alone, counting 2^48.
  sqlite3 *db = open_broken_storage(
      1, 1,
      "delete from evolu_timestamp where t = "
      "x'01000000000000000000000000000000'; update evolu_timestamp set c = "
      "281474976710656");
  CHECK(db != NULL);
  CHECK_EQ_INT(query_owner_int(db, "select evolu_skiplist_size(?)", owner, 0),
               281474976710656LL);
  CHECK_EQ_INT(query_owner_int(db,
                               "select length(evolu_skiplist_fingerprints(?, "
                               "x'0001000000000000'))",
                               owner, 0),
               28);
  CHECK_EQ_INT(query_owner_int(db,
                               "select length(evolu_skiplist_timestamp_at(?, "
                               "?))",
                               owner, 281474976710655LL),
               16);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);

  // {2} at level 2 sums {1}, counting 2^48 - 1, and itself.
  db = open_broken_storage(1, 1,
                           "update evolu_timestamp set c = 281474976710655 "
                           "where t = x'01000000000000000000000000000000'");
  CHECK(db != NULL);
  CHECK_EQ_INT(run_for_owner(db, "select evolu_skiplist_insert(?, "
                                 "x'02000000000000000000000000000000', 2)"),
               SQLITE_ROW);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);

  // {3} at level 2, counting 2^48 - 1, gains {2}.
  db = open_broken_storage(
      1, 2, "update evolu_timestamp set c = 281474976710655 where l = 2");
  CHECK(db != NULL);
  CHECK_EQ_INT(run_for_owner(db, "select evolu_skiplist_insert(?, "
                                 "x'02000000000000000000000000000000', 1)"),
               SQLITE_ROW);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);

  // Four records take 112 bytes, as many as the limit.
  db = open_storage();
  CHECK(db != NULL);
  sqlite3_stmt *statement = NULL;
  CHECK_EQ_INT(sqlite3_prepare_v2(db,
                                  "select evolu_skiplist_fingerprints("
                                  "zeroblob(16), zeroblob(32))",
                                  -1, &statement, NULL),
               SQLITE_OK);
  sqlite3_limit(db, SQLITE_LIMIT_LENGTH, 112);
  int rc = sqlite3_step(statement);
  sqlite3_finalize(statement);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
  CHECK_EQ_INT(rc, SQLITE_ROW);
}

/*
 * Runs sql in a transaction it rolls back, with ?1 bound to owner 0, and
 * SQLite's allocations failing from the allowed-th on, or none at -1. Returns
 * the step's result and sets *is_exhausted when an allocation failed.
 */
static int run_allowing(sqlite3 *db, const char *sql, int allowed,
                        int *is_exhausted) {
  // So the call prepares its statements, which can fail too.
  evolu_skiplist_finalize(db);
  int rc = sqlite3_exec(db, "begin", NULL, NULL, NULL);
  if (rc != SQLITE_OK) return rc;
  static const uint8_t owner[16] = {0};
  sqlite3_stmt *statement = NULL;
  test_sqlite_allocations_left = allowed;
  rc = sqlite3_prepare_v2(db, sql, -1, &statement, NULL);
  if (rc == SQLITE_OK) {
    sqlite3_bind_blob(statement, 1, owner, sizeof owner, SQLITE_STATIC);
    rc = sqlite3_step(statement);
  }
  *is_exhausted = test_sqlite_allocations_left == -2;
  test_sqlite_allocations_left = -1;
  sqlite3_finalize(statement);
  // SQLite can roll a transaction back itself when it runs out of memory.
  if (!sqlite3_get_autocommit(db))
    sqlite3_exec(db, "rollback", NULL, NULL, NULL);
  return rc;
}

/* Owner 0's timestamps for the tests of failing allocations. */
static const struct {
  uint8_t first;
  int level;
} nomem_timestamps[] = {{1, 1}, {3, 3}, {5, 1}, {7, 2}, {9, 1}};

/* Each function's call for owner 0, which those tests run. */
static const char *const nomem_calls[] = {
    "evolu_skiplist_size(?1)",
    "evolu_skiplist_timestamp_at(?1, 3)",
    "evolu_skiplist_fingerprints(?1, x'00000000000000020000000000000004')",
    "evolu_skiplist_lower_bound(?1, x'06000000000000000000000000000000')",
    "evolu_skiplist_insert(?1, x'06000000000000000000000000000000', 3)",
    // Without a walk, so its first statement after exists finds the nodes
    // after it.
    "evolu_skiplist_insert(?1, x'06000000000000000000000000000000', 1)",
};

/* Opens a storage with owner 0's nomem_timestamps. */
static sqlite3 *open_nomem_storage(void) {
  sqlite3 *db = open_storage();
  uint8_t owner[16] = {0};
  for (size_t i = 0;
       db != NULL && i < sizeof nomem_timestamps / sizeof nomem_timestamps[0];
       i++) {
    uint8_t t[16] = {nomem_timestamps[i].first};
    long long inserted;
    if (insert_timestamp(db, owner, t, nomem_timestamps[i].level, &inserted) !=
        SQLITE_OK) {
      close_storage(db);
      return NULL;
    }
  }
  return db;
}

/*
 * Each function, run with SQLite's allocations failing from the n-th on for
 * every n until one runs whole, fails with SQLITE_NOMEM wherever it can't
 * allocate: a statement it prepares or steps, or its result. Then it gives
 * what it gives with memory.
 */
static void skiplist_functions_fail_with_nomem_when_sqlite_cant_allocate(void) {
  sqlite3 *db = open_nomem_storage();
  CHECK(db != NULL);
  uint8_t owner[16] = {0};
  for (size_t i = 0; i < sizeof nomem_calls / sizeof nomem_calls[0]; i++) {
    char sql[128];
    snprintf(sql, sizeof sql, "select %s", nomem_calls[i]);
    int is_exhausted;
    int expected = run_allowing(db, sql, -1, &is_exhausted);
    int failed = 0;
    for (int allowed = 0;; allowed++) {
      int rc = run_allowing(db, sql, allowed, &is_exhausted);
      if (!is_exhausted) {
        failed += rc != expected;
        break;
      }
      failed += rc != SQLITE_NOMEM;
    }
    if (failed) {
      test_fail(__FILE__, __LINE__, sql);
      return;
    }
  }
  CHECK_EQ_INT(query_owner_int(db,
                               "select count(*) from evolu_timestamp where "
                               "ownerId = ?",
                               owner, 0),
               5);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
}

/* Owner 0's rows of evolu_timestamp as text, freed with sqlite3_free. */
static char *timestamp_rows(sqlite3 *db) {
  sqlite3_stmt *statement = NULL;
  char *rows = NULL;
  if (sqlite3_prepare_v2(db,
                         "select group_concat(hex(t) || ' ' || h1 || ' ' || h2 "
                         "|| ' ' || c || ' ' || l, ',' order by t) from "
                         "evolu_timestamp",
                         -1, &statement, NULL) == SQLITE_OK &&
      sqlite3_step(statement) == SQLITE_ROW)
    rows = sqlite3_mprintf("%s", sqlite3_column_text(statement, 0));
  sqlite3_finalize(statement);
  return rows;
}

/*
 * Runs sql with ?1 bound to owner 0 in a transaction, committed when it
 * succeeds and rolled back when it fails, as Storage.ts's callers do, with
 * only the n-th of SQLite's allocations failing, or none at -1. Returns the
 * step's result, sets *result to its first column as text and *rows to the
 * rows after it, each freed with sqlite3_free, and sets *has_failed when an
 * allocation failed.
 */
static int run_failing_one(sqlite3 *db, const char *sql, int n, char **result,
                           char **rows, int *has_failed) {
  static const uint8_t owner[16] = {0};
  *result = NULL;
  *has_failed = 0;
  int rc = sqlite3_exec(db, "begin", NULL, NULL, NULL);
  if (rc == SQLITE_OK) {
    sqlite3_stmt *statement = NULL;
    test_sqlite_allocations_until_one_fails = n;
    rc = sqlite3_prepare_v2(db, sql, -1, &statement, NULL);
    if (rc == SQLITE_OK) {
      sqlite3_bind_blob(statement, 1, owner, sizeof owner, SQLITE_STATIC);
      rc = sqlite3_step(statement);
    }
    *has_failed = test_sqlite_allocations_until_one_fails == -2;
    test_sqlite_allocations_until_one_fails = -1;
    if (rc == SQLITE_ROW)
      *result = sqlite3_mprintf("%s", sqlite3_column_text(statement, 0));
    sqlite3_finalize(statement);
    // SQLite can roll a transaction back itself when it runs out of memory.
    if (!sqlite3_get_autocommit(db))
      sqlite3_exec(db, rc == SQLITE_ROW ? "commit" : "rollback", NULL, NULL,
                   NULL);
  }
  *rows = timestamp_rows(db);
  return rc;
}

/*
 * Each function, run on a new connection with only the n-th of SQLite's
 * allocations failing, for every n until one runs whole, fails with
 * SQLITE_NOMEM and leaves every row as it was, or gives what it gives with
 * memory, where SQLite recovers. That's why the functions don't check what
 * sqlite3_bind_* returns: a copy of a bound value that SQLite can't allocate
 * sets db->mallocFailed, which sqlite3OomClear keeps while the caller's
 * statement runs, so the next sqlite3_step fails with SQLITE_NOMEM before a
 * statement runs with that value NULL.
 */
static void skiplist_functions_fail_with_nomem_when_one_allocation_fails(void) {
  for (size_t i = 0; i < sizeof nomem_calls / sizeof nomem_calls[0]; i++) {
    char sql[128];
    snprintf(sql, sizeof sql, "select quote(%s)", nomem_calls[i]);
    sqlite3 *db = open_nomem_storage();
    CHECK(db != NULL);
    char *before = timestamp_rows(db);
    char *expected;
    char *expected_rows;
    int has_failed;
    int expected_rc =
        run_failing_one(db, sql, -1, &expected, &expected_rows, &has_failed);
    CHECK_EQ_INT(close_storage(db), SQLITE_OK);
    int wrong = expected_rc != SQLITE_ROW;
    int nomem = 0;
    for (int n = 0; !wrong; n++) {
      db = open_nomem_storage();
      CHECK(db != NULL);
      char *result;
      char *rows;
      int rc = run_failing_one(db, sql, n, &result, &rows, &has_failed);
      CHECK_EQ_INT(close_storage(db), SQLITE_OK);
      if (rc == SQLITE_NOMEM) {
        nomem++;
        wrong = strcmp(rows, before) != 0;
      } else
        wrong = rc != SQLITE_ROW || strcmp(result, expected) != 0 ||
                strcmp(rows, expected_rows) != 0;
      sqlite3_free(result);
      sqlite3_free(rows);
      if (!has_failed) break;
    }
    sqlite3_free(before);
    sqlite3_free(expected);
    sqlite3_free(expected_rows);
    if (wrong || nomem == 0) {
      test_fail(__FILE__, __LINE__, sql);
      return;
    }
  }
}

static void
skiplist_core_register_fails_with_nomem_when_sqlite_cant_allocate(void) {
  int failed = 0;
  for (int allowed = 0;; allowed++) {
    sqlite3 *db = NULL;
    CHECK_EQ_INT(sqlite3_open_v2(":memory:", &db, SQLITE_OPEN_READWRITE, NULL),
                 SQLITE_OK);
    test_sqlite_allocations_left = allowed;
    int rc = evolu_core_register(db);
    int is_exhausted = test_sqlite_allocations_left == -2;
    test_sqlite_allocations_left = -1;
    CHECK_EQ_INT(close_storage(db), SQLITE_OK);
    if (!is_exhausted) {
      CHECK_EQ_INT(rc, SQLITE_OK);
      break;
    }
    failed++;
    CHECK_EQ_INT(rc, SQLITE_NOMEM);
  }
  // At least one per function.
  CHECK(failed >= 6);
}

/*
 * A level that isn't an integer, which only a table without STRICT holds,
 * fails a function with SQLITE_CORRUPT, whether it's the highest or the
 * lowest.
 */
static void skiplist_functions_fail_with_corrupt_on_levels_other_than_integers(
    void) {
  static const char *const rows[] = {
      // Text sorts after every number, so it's the highest.
      "(zeroblob(16), x'01', 1, 1, 1, 1), (zeroblob(16), x'03', 1, 1, 1, 'x')",
      "(zeroblob(16), x'01', 1, 1, 1, 1.5), (zeroblob(16), x'03', 1, 1, 1, 2)",
  };
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    sqlite3 *db = NULL;
    CHECK_EQ_INT(sqlite3_open_v2(":memory:", &db,
                                 SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
                                 NULL),
                 SQLITE_OK);
    char sql[512];
    snprintf(sql, sizeof sql,
             "create table evolu_timestamp (ownerId blob not null, t blob not "
             "null, h1 integer, h2 integer, c integer, l integer not null, "
             "primary key (ownerId, t)); insert into evolu_timestamp values "
             "%s",
             rows[i]);
    int rc = sqlite3_exec(db, sql, NULL, NULL, NULL);
    if (rc == SQLITE_OK) rc = evolu_core_register(db);
    if (rc == SQLITE_OK)
      rc = run_for_owner(db, "select evolu_skiplist_size(?)");
    CHECK_EQ_INT(close_storage(db), SQLITE_OK);
    CHECK_EQ_INT(rc, SQLITE_CORRUPT);
  }
}

/* The connection's statements, at most 16, and their count. */
static int statements_of(sqlite3 *db, sqlite3_stmt *statements[16]) {
  int count = 0;
  for (sqlite3_stmt *statement = sqlite3_next_stmt(db, NULL);
       statement != NULL && count < 16;
       statement = sqlite3_next_stmt(db, statement))
    statements[count++] = statement;
  return count;
}

/* Every read function's call, for owner 0, and an insert. */
static const char *const kept_calls[] = {
    "select evolu_skiplist_size(?)",
    "select evolu_skiplist_timestamp_at(?, 1)",
    "select evolu_skiplist_fingerprints(?, x'0000000000000001')",
    "select evolu_skiplist_lower_bound(?, x'02000000000000000000000000000000')",
    "select evolu_skiplist_insert(?, x'02000000000000000000000000000000', 2)",
};

/* Runs kept_calls on owner 0's {1} at level 2 and {3} at level 1. */
static int run_kept_calls(sqlite3 *db) {
  int ok = 1;
  for (size_t i = 0; i < sizeof kept_calls / sizeof kept_calls[0]; i++)
    ok &= run_for_owner(db, kept_calls[i]) == SQLITE_ROW;
  return ok;
}

static void skiplist_connection_keeps_its_statements_until_finalized(void) {
  sqlite3 *db = open_broken_storage(2, 1, "select 1");
  CHECK(db != NULL);
  CHECK(run_kept_calls(db));
  sqlite3_stmt *kept[16];
  int count = statements_of(db, kept);
  CHECK(count > 0);
  // Reset, so none keeps a read transaction or reads a call's bindings.
  for (int i = 0; i < count; i++) CHECK(!sqlite3_stmt_busy(kept[i]));
  // The calls run on the same statements again, which SQLite never prepares
  // again, as it would after a rebinding of a value its plan depends on.
  CHECK(run_kept_calls(db));
  sqlite3_stmt *again[16];
  CHECK_EQ_INT(statements_of(db, again), count);
  CHECK(memcmp(again, kept, sizeof *kept * (size_t)count) == 0);
  for (int i = 0; i < count; i++)
    CHECK_EQ_INT(
        sqlite3_stmt_status(again[i], SQLITE_STMTSTATUS_REPREPARE, 0), 0);
  // sqlite3_close refuses a connection with them.
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_BUSY);
  evolu_skiplist_finalize(db);
  CHECK(sqlite3_next_stmt(db, NULL) == NULL);
  // Again, it finds nothing to finalize.
  evolu_skiplist_finalize(db);
  // A later call prepares them again.
  CHECK(run_kept_calls(db));
  CHECK(sqlite3_next_stmt(db, NULL) != NULL);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
  // A connection without the functions has none to finalize.
  CHECK_EQ_INT(sqlite3_open_v2(":memory:", &db, SQLITE_OPEN_READWRITE, NULL),
               SQLITE_OK);
  evolu_skiplist_finalize(db);
  CHECK_EQ_INT(sqlite3_close(db), SQLITE_OK);
}

/* SQLite's allocations not yet freed, which the hooks count. */
static long allocations_live;

static void count_malloc(void *p, int size) {
  (void)p;
  (void)size;
  allocations_live++;
}

static void count_free(void *p, int size) {
  (void)p;
  (void)size;
  allocations_live--;
}

/*
 * sqlite3_close_v2 finalizes the statements the functions keep, through the
 * destructor of the connection's client data, which it runs while a
 * statement of the caller's still keeps the connection open as a zombie, so
 * finalizing that statement then closes it, freeing all its memory.
 */
static void skiplist_close_v2_finalizes_the_kept_statements(void) {
  allocations_live = 0;
  test_sqlite_malloc_hook = count_malloc;
  test_sqlite_free_hook = count_free;
  sqlite3 *db = open_broken_storage(2, 1, "select 1");
  sqlite3_stmt *callers = NULL;
  int ran = db != NULL && run_kept_calls(db) &&
            sqlite3_next_stmt(db, NULL) != NULL &&
            sqlite3_prepare_v2(db, "select t from evolu_timestamp", -1,
                               &callers, NULL) == SQLITE_OK &&
            sqlite3_step(callers) == SQLITE_ROW;
  int closed = sqlite3_close_v2(db);
  int finalized = sqlite3_finalize(callers);
  test_sqlite_malloc_hook = NULL;
  test_sqlite_free_hook = NULL;
  CHECK(ran);
  CHECK_EQ_INT(closed, SQLITE_OK);
  CHECK_EQ_INT(finalized, SQLITE_OK);
  CHECK_EQ_INT(allocations_live, 0);
}

/*
 * Opens owner 0's {1} at level 2 and {3} at level 1, runs kept_calls, and
 * prepares the caller's statement sql, with ?1 bound to owner 0, counting
 * SQLite's allocations from before the open.
 */
static sqlite3 *open_counted_storage(const char *sql, sqlite3_stmt **callers) {
  allocations_live = 0;
  test_sqlite_malloc_hook = count_malloc;
  test_sqlite_free_hook = count_free;
  static const uint8_t owner[16] = {0};
  *callers = NULL;
  sqlite3 *db = open_broken_storage(2, 1, "select 1");
  if (db != NULL && run_kept_calls(db) &&
      sqlite3_prepare_v2(db, sql, -1, callers, NULL) == SQLITE_OK)
    sqlite3_bind_blob(*callers, 1, owner, sizeof owner, SQLITE_STATIC);
  return db;
}

/*
 * The functions stay registered on the zombie that sqlite3_close_v2 leaves
 * while a statement of the caller's is open, so stepping that statement calls
 * one after the close finalized the kept statements. The call uses no memory
 * the close freed, SQLite refuses its statements on a closed connection, and
 * finalizing the statement closes the zombie, freeing all its memory.
 */
static void skiplist_a_call_after_close_v2_uses_no_freed_memory(void) {
  sqlite3_stmt *callers;
  sqlite3 *db =
      open_counted_storage("select evolu_skiplist_size(?1)", &callers);
  int closed = sqlite3_close_v2(db);
  int stepped = sqlite3_step(callers);
  int finalized = sqlite3_finalize(callers);
  test_sqlite_malloc_hook = NULL;
  test_sqlite_free_hook = NULL;
  CHECK(callers != NULL);
  CHECK_EQ_INT(closed, SQLITE_OK);
  CHECK_EQ_INT(stepped, SQLITE_MISUSE);
  CHECK_EQ_INT(finalized, SQLITE_MISUSE);
  CHECK_EQ_INT(allocations_live, 0);
}

/* An application's function, which replaces a skiplist function. */
static void return_null(sqlite3_context *context, int argc,
                        sqlite3_value **argv) {
  (void)argc;
  (void)argv;
  sqlite3_result_null(context);
}

/*
 * The cache lives while the connection or a registration of a function can
 * reach it: registering again, and an application's functions that replace
 * all five, release the registrations they replace, and the cache goes with
 * the last of them or the connection, whichever goes last.
 */
static void skiplist_the_cache_goes_with_its_last_reference(void) {
  static const struct {
    const char *name;
    int argc;
  } functions[] = {
      {"evolu_skiplist_insert", 3},       {"evolu_skiplist_size", 1},
      {"evolu_skiplist_fingerprints", 2}, {"evolu_skiplist_lower_bound", 2},
      {"evolu_skiplist_timestamp_at", 2},
  };
  for (int replaces = 0; replaces < 2; replaces++) {
    allocations_live = 0;
    test_sqlite_malloc_hook = count_malloc;
    test_sqlite_free_hook = count_free;
    sqlite3 *db = open_broken_storage(2, 1, "select 1");
    int ran = db != NULL && run_kept_calls(db) &&
              evolu_core_register(db) == SQLITE_OK && run_kept_calls(db);
    for (size_t i = 0;
         replaces && ran && i < sizeof functions / sizeof functions[0]; i++)
      ran = sqlite3_create_function_v2(db, functions[i].name, functions[i].argc,
                                       SQLITE_UTF8, NULL, return_null, NULL,
                                       NULL, NULL) == SQLITE_OK;
    evolu_skiplist_finalize(db);
    int closed = sqlite3_close(db);
    test_sqlite_malloc_hook = NULL;
    test_sqlite_free_hook = NULL;
    CHECK(ran);
    CHECK_EQ_INT(closed, SQLITE_OK);
    CHECK_EQ_INT(allocations_live, 0);
  }
}

static void skiplist_registering_again_keeps_the_statements(void) {
  sqlite3 *db = open_broken_storage(2, 1, "select 1");
  CHECK(db != NULL);
  CHECK(run_kept_calls(db));
  sqlite3_stmt *kept[16];
  int count = statements_of(db, kept);
  CHECK_EQ_INT(evolu_core_register(db), SQLITE_OK);
  CHECK(run_kept_calls(db));
  sqlite3_stmt *again[16];
  CHECK_EQ_INT(statements_of(db, again), count);
  CHECK(memcmp(again, kept, sizeof *kept * (size_t)count) == 0);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
}

/* The size of owner 0, which the application's function reads, or -2. */
static long long nested_size;

/* An application's function that calls a skiplist function. */
static void read_size(sqlite3_context *context, int argc,
                      sqlite3_value **argv) {
  (void)argc;
  (void)argv;
  static const uint8_t owner[16] = {0};
  nested_size = query_owner_int(sqlite3_context_db_handle(context),
                                "select evolu_skiplist_size(?)", owner, 0);
  sqlite3_result_null(context);
}

/*
 * An insert updates {3} after it, which fires a trigger that calls an
 * application's function, which reads the size while the insert's statements
 * are in use, so it reads with statements of its own.
 */
static void skiplist_a_call_inside_another_gets_statements_of_its_own(void) {
  sqlite3 *db = open_broken_storage(1, 2, "select 1");
  CHECK(db != NULL);
  CHECK_EQ_INT(sqlite3_create_function_v2(db, "read_size", 0, SQLITE_UTF8,
                                          NULL, read_size, NULL, NULL, NULL),
               SQLITE_OK);
  CHECK_EQ_INT(sqlite3_exec(db,
                            "create trigger read before update on "
                            "evolu_timestamp begin select read_size(); end",
                            NULL, NULL, NULL),
               SQLITE_OK);
  sqlite3_stmt *kept[16];
  CHECK(run_kept_calls(db));
  int count = statements_of(db, kept);
  nested_size = -2;
  uint8_t owner[16] = {0};
  uint8_t t[16] = {2};
  long long inserted;
  CHECK_EQ_INT(insert_timestamp(db, owner, t, 1, &inserted), SQLITE_OK);
  CHECK_EQ_INT(inserted, 1);
  // Before {3} counts {2}.
  CHECK_EQ_INT(nested_size, 2);
  CHECK_EQ_INT(query_owner_int(db, "select evolu_skiplist_size(?)", owner, 0),
               3);
  // The nested call's statements are gone.
  sqlite3_stmt *after[16];
  CHECK_EQ_INT(statements_of(db, after), count);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
}

/* Counts the starts of statements that walk a level. */
static int count_level_walks(unsigned type, void *context, void *statement,
                             void *sql) {
  (void)type;
  (void)sql;
  const char *text = sqlite3_sql(statement);
  if (text != NULL && strstr(text, "l = ?2") != NULL) (*(int *)context)++;
  return 0;
}

/* A level is walked by stepping one statement across its nodes. */
static void skiplist_walks_a_level_with_one_statement(void) {
  sqlite3 *db = open_storage();
  CHECK(db != NULL);
  uint8_t owner[16] = {0};
  for (int i = 0; i < 100; i++) {
    uint8_t t[16] = {0};
    t[15] = (uint8_t)(i + 1);
    long long inserted;
    CHECK_EQ_INT(insert_timestamp(db, owner, t, 1, &inserted), SQLITE_OK);
  }
  int walks = 0;
  CHECK_EQ_INT(
      sqlite3_trace_v2(db, SQLITE_TRACE_STMT, count_level_walks, &walks),
      SQLITE_OK);
  CHECK_EQ_INT(query_owner_int(db, "select evolu_skiplist_size(?)", owner, 0),
               100);
  sqlite3_trace_v2(db, 0, NULL, NULL);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
  CHECK_EQ_INT(walks, 1);
}

/*
 * The functions' statements read the index or the primary key, never a whole
 * table, on an owner with timestamps at many levels and another owner's beside
 * them.
 */
static void skiplist_functions_scan_no_table(void) {
  sqlite3 *db = open_storage();
  CHECK(db != NULL);
  random_state = 7;
  for (int o = 0; o < 2; o++)
    for (int i = 0; i < 200; i++) {
      uint8_t owner[16] = {(uint8_t)o};
      // Around kept_calls' {2}, which they insert between them.
      uint8_t t[16] = {(uint8_t)(i / 50), (uint8_t)(i % 50 + 1)};
      long long inserted;
      CHECK_EQ_INT(
          insert_timestamp(db, owner, t, random_level(), &inserted),
          SQLITE_OK);
    }
  CHECK(run_kept_calls(db));
  sqlite3_stmt *kept[16];
  int count = statements_of(db, kept);
  CHECK(count > 0);
  for (int i = 0; i < count; i++)
    CHECK_EQ_INT(
        sqlite3_stmt_status(kept[i], SQLITE_STMTSTATUS_FULLSCAN_STEP, 0), 0);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
}

/*
 * A plain connection that evolu_core_register sets up, as open_storage opens
 * it with sqlite3_open_v2, is defensive, so its SQL can't write the schema,
 * even with PRAGMA writable_schema on, which it ignores.
 */
static void skiplist_core_register_makes_a_plain_connection_defensive(void) {
  sqlite3 *db = open_storage();
  CHECK(db != NULL);
  int is_defensive = -1;
  CHECK_EQ_INT(
      sqlite3_db_config(db, SQLITE_DBCONFIG_DEFENSIVE, -1, &is_defensive),
      SQLITE_OK);
  CHECK_EQ_INT(is_defensive, 1);
  char *message = error_of(db,
                           "pragma writable_schema = on; update sqlite_schema "
                           "set sql = sql where name = 'evolu_timestamp'");
  int is_refused =
      message != NULL && strstr(message, "may not be modified") != NULL;
  sqlite3_free(message);
  CHECK_EQ_INT(close_storage(db), SQLITE_OK);
  CHECK(is_refused);
}

void skiplist_suite(void) {
  RUN(skiplist_inserts_keep_every_summary_and_queries_match_brute_force);
  RUN(skiplist_small_random_skiplists_match_brute_force_after_every_insert);
  RUN(skiplist_insert_of_an_existing_timestamp_changes_nothing);
  RUN(skiplist_insert_leaves_successors_that_lose_nothing_unwritten);
  RUN(skiplist_empty_owner_has_no_timestamps);
  RUN(skiplist_functions_refuse_malformed_arguments);
  RUN(skiplist_insert_runs_only_in_a_transaction);
  RUN(skiplist_insert_fails_with_the_error_of_its_statements);
  RUN(skiplist_fingerprints_refuse_a_result_past_the_length_limit);
  RUN(skiplist_functions_run_only_from_top_level_sql);
  RUN(skiplist_functions_fail_with_corrupt_on_broken_metadata);
  RUN(skiplist_functions_accept_counts_at_the_limit);
  RUN(skiplist_reads_outside_a_transaction_read_one_snapshot);
  RUN(skiplist_functions_fail_with_nomem_when_sqlite_cant_allocate);
  RUN(skiplist_functions_fail_with_nomem_when_one_allocation_fails);
  RUN(skiplist_core_register_fails_with_nomem_when_sqlite_cant_allocate);
  RUN(skiplist_functions_fail_with_corrupt_on_levels_other_than_integers);
  RUN(skiplist_connection_keeps_its_statements_until_finalized);
  RUN(skiplist_close_v2_finalizes_the_kept_statements);
  RUN(skiplist_a_call_after_close_v2_uses_no_freed_memory);
  RUN(skiplist_the_cache_goes_with_its_last_reference);
  RUN(skiplist_registering_again_keeps_the_statements);
  RUN(skiplist_a_call_inside_another_gets_statements_of_its_own);
  RUN(skiplist_walks_a_level_with_one_statement);
  RUN(skiplist_functions_scan_no_table);
  RUN(skiplist_core_register_makes_a_plain_connection_defensive);
}
