/**
 * The skiplist functions of src/evolu_skiplist.h against skiplist-fixture.mts,
 * recorded from Storage.ts's SQL, which they replace: the same inserts, at the
 * same levels, leave the same evolu_timestamp rows, and every query returns
 * what that SQL returned. skiplist_test.c checks them against a brute-force
 * model.
 */
import {
  assert,
  assertEqual,
  bytesToHex,
  type Sqlite,
  type SqliteQuery,
} from "@evolu/common";
import { createBaseSqliteStorageTables } from "@evolu/common/local-first";
import { before, describe, it } from "node:test";
import type {
  SqliteCoreAddon,
  SqliteCoreDatabase,
  SqliteCoreValue,
} from "./addon.mts";
import { setupAddon, setupAddonTimeout } from "./setup-addon.mts";
import {
  readSkiplistFixture,
  skiplistFixtureRowsSql,
} from "./skiplist-fixture.mts";

describe("skiplist functions", () => {
  let addon: SqliteCoreAddon;

  before(
    async () => {
      addon = await setupAddon();
    },
    { timeout: setupAddonTimeout },
  );

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

  it("leaves the fixture's rows and returns its answers", () => {
    const fixture = readSkiplistFixture();
    const db = addon.openCodec(":memory:", null);
    // Storage.ts's tables, which run no parameters.
    createBaseSqliteStorageTables({
      sqlite: {
        exec: (query: SqliteQuery) => {
          addon.exec(db, query.sql);
          return { rows: [], changes: 0 };
        },
      } as unknown as Sqlite,
    });

    // In a transaction, as evolu_skiplist_insert requires.
    addon.exec(db, "begin");
    for (const { ownerId, timestamp, level, inserted } of fixture.inserts)
      assertEqual(
        selectValue(
          db,
          "select evolu_skiplist_insert(?, ?, ?)",
          ownerId,
          timestamp,
          level,
        ),
        inserted ? 1 : 0,
      );
    addon.exec(db, "commit");

    const rows: Array<SqliteCoreValue> = [];
    const statement = addon.prepare(db, skiplistFixtureRowsSql);
    while (addon.step(statement)) rows.push(addon.column(statement, 0));
    addon.finalize(statement);
    assertEqual(rows, fixture.rows);

    for (const owner of fixture.owners) {
      const { ownerId } = owner;
      assertEqual(
        selectValue(db, "select evolu_skiplist_size(?)", ownerId),
        owner.size,
      );

      for (let index = 0; index <= owner.size; index++) {
        const timestamp = selectValue(
          db,
          "select evolu_skiplist_timestamp_at(?, ?)",
          ownerId,
          index,
        );
        assertEqual(
          timestamp === null ? null : bytesToHex(timestamp as Uint8Array),
          index < owner.size ? bytesToHex(owner.timestamps[index]) : null,
        );
      }

      for (const { buckets, ranges } of owner.fingerprints) {
        const encoded = new Uint8Array(buckets.length * 8);
        const view = new DataView(encoded.buffer);
        for (const [i, bucket] of buckets.entries())
          view.setBigUint64(i * 8, BigInt(bucket));
        const records = selectValue(
          db,
          "select evolu_skiplist_fingerprints(?, ?)",
          ownerId,
          encoded,
        ) as Uint8Array;
        // Each a fingerprint and an upper bound, 16 zero bytes for none.
        assertEqual(
          bytesToHex(records),
          ranges
            .map(
              ({ fingerprint, upperBound }) =>
                bytesToHex(fingerprint) +
                bytesToHex(upperBound ?? new Uint8Array(16)),
            )
            .join(""),
        );
      }

      for (const { timestamp, index } of owner.lowerBounds)
        assertEqual(
          selectValue(
            db,
            "select evolu_skiplist_lower_bound(?, ?)",
            ownerId,
            timestamp,
          ),
          index,
        );
    }
    addon.close(db);
  });
});
