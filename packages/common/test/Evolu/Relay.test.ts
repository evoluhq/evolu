import { expect, test } from "vitest";
import {
  EncryptedCrdtMessage,
  EncryptedDbChange,
} from "../../src/Evolu/Storage.js";
import { sql, timestampBytesToTimestamp } from "../../src/index.js";
import {
  testCreateRelayStorageAndSqliteDeps,
  testOwner,
  testOwner2,
  testOwnerIdBytes,
} from "../_deps.js";
import { testTimestampsAsc } from "./_fixtures.js";

test("validateWriteKey", async () => {
  const { storage } = await testCreateRelayStorageAndSqliteDeps();

  const writeKey = testOwner.writeKey;
  const differentWriteKey = testOwner2.writeKey;

  // New owner
  const result1 = storage.validateWriteKey(testOwnerIdBytes, writeKey);
  expect(result1).toBe(true);

  // Existing owner, same write key
  const result2 = storage.validateWriteKey(testOwnerIdBytes, writeKey);
  expect(result2).toBe(true);

  // Existing owner ID, different write key
  const result3 = storage.validateWriteKey(testOwnerIdBytes, differentWriteKey);
  expect(result3).toBe(false);
});

test("deleteOwner", async () => {
  const { storage, sqlite } = await testCreateRelayStorageAndSqliteDeps();

  storage.setWriteKey(testOwnerIdBytes, testOwner.writeKey);

  const message: EncryptedCrdtMessage = {
    timestamp: timestampBytesToTimestamp(testTimestampsAsc[0]),
    change: new Uint8Array([1, 2, 3]) as EncryptedDbChange,
  };

  await storage.writeMessages(testOwnerIdBytes, [message]);

  expect(storage.getSize(testOwnerIdBytes)).toBe(1);

  const deleteResult = storage.deleteOwner(testOwnerIdBytes);
  expect(deleteResult).toBe(true);

  for (const table of ["evolu_timestamp", "evolu_message", "evolu_writeKey"]) {
    const countResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from ${sql.raw(table)}
      where ownerId = ${testOwnerIdBytes};
    `);
    expect(countResult.ok && countResult.value.rows[0].count).toBe(0);
  }
});
