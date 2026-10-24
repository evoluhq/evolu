/**
 * The skiplist functions of src/evolu_skiplist.h against Storage.ts's SQL,
 * which they replace: the same inserts, at the same levels, leave the same
 * evolu_timestamp rows, and every query returns what Storage.ts's returns and
 * what a brute-force model says, for timestamps inserted in ascending,
 * descending and random order, for two owners at once.
 */
import {
  assert,
  assertEqual,
  bytesToHex,
  NonNegativeInt,
  type Random,
  type RandomNumber,
  sql,
  type Sqlite,
  type SqliteQuery,
  type SqliteRow,
  type SqlTemplateParam,
} from "@evolu/common";
import {
  createBaseSqliteStorage,
  createBaseSqliteStorageTables,
  getTimestampByIndex,
  getTimestampInsertStrategy,
  InfiniteUpperBound,
  OwnerIdBytes,
  testFingerprintTimestamps,
  TimestampBytes,
} from "@evolu/common/local-first";
import { before, describe, it } from "node:test";
import type {
  SqliteCoreAddon,
  SqliteCoreDatabase,
  SqliteCoreValue,
} from "./addon.mts";
import { setupAddon, setupAddonTimeout } from "./setup-addon.mts";

const insertsPerOwner = 400;

describe("skiplist functions", () => {
  let addon: SqliteCoreAddon;

  before(
    async () => {
      addon = await setupAddon();
    },
    { timeout: setupAddonTimeout },
  );

  /** Evolu's Sqlite over the addon, with what Storage.ts uses. */
  const setupSqlite = (db: SqliteCoreDatabase): Sqlite => {
    const run = (
      query: SqliteQuery,
      onRow: (row: SqliteRow) => boolean,
    ): void => {
      const statement = addon.prepare(db, query.sql);
      try {
        for (const [index, value] of query.parameters.entries())
          addon.bind(statement, index + 1, value);
        while (addon.step(statement)) {
          const row: Record<string, SqliteCoreValue> = {};
          for (let i = 0; i < addon.columnCount(statement); i++)
            row[addon.columnName(statement, i)] = addon.column(statement, i);
          if (!onRow(row as SqliteRow)) break;
        }
      } finally {
        addon.finalize(statement);
      }
    };
    const unused = (): never => {
      throw new Error("Storage.ts's skiplist doesn't use it.");
    };
    const exec = (query: SqliteQuery) => {
      const rows: Array<SqliteRow> = [];
      run(query, (row) => {
        rows.push(row);
        return true;
      });
      return { rows, changes: addon.changes(db) };
    };
    return {
      exec,
      prepared: (
        strings: TemplateStringsArray,
        ...parameters: Array<SqlTemplateParam>
      ) => exec(sql(strings, ...parameters)),
      iterate: run,
      transaction: unused,
      export: unused,
      [Symbol.asyncDispose]: unused,
    } as Sqlite;
  };

  const selectValue = (
    db: SqliteCoreDatabase,
    sql: string,
    ...parameters: ReadonlyArray<SqliteCoreValue>
  ): SqliteCoreValue => {
    const statement = addon.prepare(db, sql);
    try {
      for (const [index, value] of parameters.entries())
        addon.bind(statement, index + 1, value);
      assert(addon.step(statement), "No row.");
      return addon.column(statement, 0);
    } finally {
      addon.finalize(statement);
    }
  };

  const rowsOf = (db: SqliteCoreDatabase): string => {
    const rows: Array<string> = [];
    const statement = addon.prepare(
      db,
      "select hex(ownerId) || ' ' || hex(t) || ' ' || h1 || ' ' || h2 || ' ' || c || ' ' || l from evolu_timestamp order by ownerId, t",
    );
    while (addon.step(statement)) rows.push(String(addon.column(statement, 0)));
    addon.finalize(statement);
    return rows.join("\n");
  };

  const checkOrder = (order: "ascending" | "descending" | "random"): void => {
    // Xorshift32, so every run inserts the same timestamps.
    let state = order.length * 7919;
    const nextRandom = (): number => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    };
    // Storage.ts draws a level from these; each insert queues its own.
    const randomNumbers: Array<number> = [];
    const random: Random = {
      next: () => {
        const value = randomNumbers.shift();
        assert(value != null, "No queued random number.");
        return value as RandomNumber;
      },
    };
    const sqlDb = addon.openCodec(":memory:", null);
    const coreDb = addon.openCodec(":memory:", null);
    const sqlite = setupSqlite(sqlDb);
    createBaseSqliteStorageTables({ sqlite });
    createBaseSqliteStorageTables({ sqlite: setupSqlite(coreDb) });
    const storage = createBaseSqliteStorage({ sqlite, random });

    const owners = [0xa1, 0xb2].map((byte) =>
      OwnerIdBytes.orThrow(new Uint8Array(16).fill(byte)),
    );
    const models = owners.map(() => ({
      timestamps: new Array<TimestampBytes>(),
      bounds: null as null | [TimestampBytes, TimestampBytes],
    }));

    const insert = (owner: number, timestamp: TimestampBytes): void => {
      const model = models[owner];
      let level = 1;
      while (nextRandom() % 4 === 0 && level < 10) level++;
      // This draw rarely reaches the top levels.
      if (nextRandom() % 8 === 0) level = 1 + (nextRandom() % 10);
      // Storage.ts draws once more after the last level, also at level 10.
      randomNumbers.push(...Array.from({ length: level - 1 }, () => 0.1), 0.9);
      // As Storage.ts's callers choose it, from the owner's first and last
      // timestamps, both the timestamp itself at first.
      const [strategy, first, last] = getTimestampInsertStrategy(
        timestamp,
        ...(model.bounds ?? [timestamp, timestamp]),
      );
      model.bounds = [first, last];
      const insertedBySql = storage.insertTimestamp(
        owners[owner],
        timestamp,
        strategy,
      );
      // In a transaction, as evolu_skiplist_insert requires.
      addon.exec(coreDb, "begin");
      const insertedByCore = selectValue(
        coreDb,
        "select evolu_skiplist_insert(?, ?, ?)",
        owners[owner],
        timestamp,
        level,
      );
      addon.exec(coreDb, "commit");
      assertEqual(insertedByCore, insertedBySql ? 1 : 0);
      assertEqual(randomNumbers.length, 0);
      if (insertedBySql) {
        model.timestamps.push(timestamp);
        model.timestamps.sort(compareBytes);
      }
    };

    for (let i = 0; i < insertsPerOwner * 2; i++) {
      insert(i % 2, timestampFor(order, Math.floor(i / 2), nextRandom));
      if (i % 50 === 49) assertEqual(rowsOf(coreDb), rowsOf(sqlDb));
    }
    // Existing timestamps change nothing.
    for (let i = 0; i < 20; i++) {
      const model = models[i % 2];
      insert(i % 2, model.timestamps[nextRandom() % model.timestamps.length]);
    }
    assertEqual(rowsOf(coreDb), rowsOf(sqlDb));

    for (const [owner, model] of models.entries()) {
      const ownerId = owners[owner];
      const size = model.timestamps.length as NonNegativeInt;
      assertEqual(size, insertsPerOwner);
      assertEqual(storage.getSize(ownerId), size);
      assertEqual(
        selectValue(coreDb, "select evolu_skiplist_size(?)", ownerId),
        size,
      );

      for (let index = 0; index < size; index++) {
        const expected = bytesToHex(model.timestamps[index]);
        assertEqual(
          bytesToHex(
            getTimestampByIndex({ sqlite })(ownerId, index as NonNegativeInt),
          ),
          expected,
        );
        assertEqual(
          bytesToHex(
            selectValue(
              coreDb,
              "select evolu_skiplist_timestamp_at(?, ?)",
              ownerId,
              index,
            ) as Uint8Array,
          ),
          expected,
        );
      }

      for (let round = 0; round < 30; round++) {
        const buckets = Array.from(
          { length: 1 + (nextRandom() % 16) },
          () => nextRandom() % (size + 1),
        ).toSorted((a, b) => a - b);
        buckets[buckets.length - 1] = size;
        const ranges = storage.fingerprintRanges(
          ownerId,
          buckets.map((bucket) => NonNegativeInt.orThrow(bucket)),
        );
        const encoded = new Uint8Array(buckets.length * 8);
        const view = new DataView(encoded.buffer);
        for (const [i, bucket] of buckets.entries())
          view.setBigUint64(i * 8, BigInt(bucket));
        const records = selectValue(
          coreDb,
          "select evolu_skiplist_fingerprints(?, ?)",
          ownerId,
          encoded,
        ) as Uint8Array;
        assertEqual(records.length, buckets.length * 28);
        for (const [i, range] of ranges.entries()) {
          const record = records.subarray(i * 28, i * 28 + 28);
          const expected = bytesToHex(
            testFingerprintTimestamps(
              model.timestamps.slice(i === 0 ? 0 : buckets[i - 1], buckets[i]),
            ),
          );
          assertEqual(bytesToHex(range.fingerprint), expected);
          assertEqual(bytesToHex(record.subarray(0, 12)), expected);
          // Storage.ts takes the last range's upper bound from its caller.
          if (i < ranges.length - 1) {
            assert(range.upperBound !== InfiniteUpperBound, "A bound.");
            assertEqual(
              bytesToHex(record.subarray(12)),
              bytesToHex(range.upperBound),
            );
            assertEqual(
              bytesToHex(record.subarray(12)),
              bytesToHex(model.timestamps[buckets[i]]),
            );
          }
        }
      }

      for (let round = 0; round < 200; round++) {
        const probe =
          round % 2 === 0
            ? model.timestamps[nextRandom() % size]
            : timestampFor("random", 0, nextRandom);
        const expected = model.timestamps.findIndex(
          (timestamp) => compareBytes(timestamp, probe) >= 0,
        );
        assertEqual(
          storage.findLowerBound(ownerId, 0 as NonNegativeInt, size, probe),
          expected === -1 ? size : expected,
        );
        assertEqual(
          selectValue(
            coreDb,
            "select evolu_skiplist_lower_bound(?, ?)",
            ownerId,
            probe,
          ),
          expected === -1 ? null : expected,
        );
      }
    }
    addon.close(sqlDb);
    addon.close(coreDb);
  };

  for (const order of ["ascending", "descending", "random"] as const)
    it(`leaves the rows Storage.ts leaves and answers as it does for ${order} inserts`, () => {
      checkOrder(order);
    });
});

const timestampFor = (
  order: "ascending" | "descending" | "random",
  position: number,
  nextRandom: () => number,
): TimestampBytes => {
  const bytes = Uint8Array.from({ length: 16 }, () => nextRandom() & 0xff);
  if (order !== "random")
    new DataView(bytes.buffer).setUint32(
      0,
      order === "ascending" ? position : 0xffffffff - position,
    );
  return TimestampBytes.orThrow(bytes);
};

const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++)
    if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};
