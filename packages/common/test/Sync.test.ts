import { expect, test } from "vitest";
import { getExistingTimestamps } from "../src/Evolu/Sync.js";
import { ok } from "../src/Result.js";
import { sql } from "../src/Sqlite.js";
import {
  testCreateSqlite,
  testOwnerIdBytes,
  testOwnerIdBytes2,
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

  const timestamp1Bytes = testTimestampsAsc[0];
  const timestamp2Bytes = testTimestampsAsc[1];
  const timestamp3Bytes = testTimestampsAsc[2];

  const allTimestamps = [
    timestamp1Bytes,
    timestamp2Bytes,
    timestamp3Bytes,
  ] as const;

  // Test 1: No existing timestamps - should return empty array
  const emptyResult = getExistingTimestamps({ sqlite })(
    testOwnerIdBytes,
    allTimestamps,
  );
  expect(emptyResult).toEqual(ok([]));

  // Test 2: Insert some timestamps and verify they are found
  sqlite.exec(sql`
    insert into evolu_timestamp (ownerId, t)
    values (${testOwnerIdBytes}, ${timestamp1Bytes});
  `);

  sqlite.exec(sql`
    insert into evolu_timestamp (ownerId, t)
    values (${testOwnerIdBytes}, ${timestamp2Bytes});
  `);

  // Check for all three timestamps - only first two should be found
  const result = getExistingTimestamps({ sqlite })(
    testOwnerIdBytes,
    allTimestamps,
  );
  expect(result).toEqual(
    ok([timestamp1Bytes, timestamp2Bytes].map((t) => Buffer.from(t))),
  );

  const resultOtherOwner = getExistingTimestamps({ sqlite })(
    testOwnerIdBytes2,
    allTimestamps,
  );
  expect(resultOtherOwner).toEqual(ok([]));

  // Test 4: Test with single timestamp
  const singleResult = getExistingTimestamps({ sqlite })(testOwnerIdBytes, [
    timestamp1Bytes,
  ]);

  expect(singleResult).toEqual(
    ok([timestamp1Bytes].map((t) => Buffer.from(t))),
  );
});

// Sync is integration-tested in `Db.test.ts`.
