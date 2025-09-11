import { expect, test } from "vitest";
import { getExistingTimestamps } from "../src/Evolu/Sync.js";
import { ok } from "../src/Result.js";
import { sql } from "../src/Sqlite.js";
import {
  testCreateSqlite,
  testOwnerBinaryId,
  testOwnerBinaryId2,
} from "./_deps.js";
import { testTimestampsAsc } from "./Evolu/_fixtures.js";

test("getExistingTimestamps works correctly with CTE", async () => {
  const sqlite = await testCreateSqlite();

  // Create fake evolu_timestamp table for testing
  sqlite.exec(sql`
    create table evolu_timestamp (
      ownerId blob not null,
      t blob not null
    );
  `);

  const binaryTimestamp1 = testTimestampsAsc[0];
  const binaryTimestamp2 = testTimestampsAsc[1];
  const binaryTimestamp3 = testTimestampsAsc[2];

  const allTimestamps = [
    binaryTimestamp1,
    binaryTimestamp2,
    binaryTimestamp3,
  ] as const;

  // Test 1: No existing timestamps - should return empty array
  const emptyResult = getExistingTimestamps(
    { sqlite },
    testOwnerBinaryId,
    allTimestamps,
  );
  expect(emptyResult).toEqual(ok([]));

  // Test 2: Insert some timestamps and verify they are found
  sqlite.exec(sql`
    insert into evolu_timestamp (ownerId, t)
    values (${testOwnerBinaryId}, ${binaryTimestamp1});
  `);

  sqlite.exec(sql`
    insert into evolu_timestamp (ownerId, t)
    values (${testOwnerBinaryId}, ${binaryTimestamp2});
  `);

  // Check for all three timestamps - only first two should be found
  const result = getExistingTimestamps(
    { sqlite },
    testOwnerBinaryId,
    allTimestamps,
  );
  expect(result).toEqual(
    ok([binaryTimestamp1, binaryTimestamp2].map((t) => Buffer.from(t))),
  );

  const resultOtherOwner = getExistingTimestamps(
    { sqlite },
    testOwnerBinaryId2,
    allTimestamps,
  );
  expect(resultOtherOwner).toEqual(ok([]));

  // Test 4: Test with single timestamp
  const singleResult = getExistingTimestamps({ sqlite }, testOwnerBinaryId, [
    binaryTimestamp1,
  ]);

  expect(singleResult).toEqual(
    ok([binaryTimestamp1].map((t) => Buffer.from(t))),
  );
});

// Sync is integration-tested in `Db.test.ts`.
