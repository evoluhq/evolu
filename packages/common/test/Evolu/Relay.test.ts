import { expect, test } from "vitest";
import { createRelayStorage } from "../../src/Evolu/Relay.js";
import {
  EncryptedCrdtMessage,
  EncryptedDbChange,
} from "../../src/Evolu/Storage.js";
import { constVoid } from "../../src/Function.js";
import { binaryTimestampToTimestamp, sql } from "../../src/index.js";
import { getOrThrow } from "../../src/Result.js";
import {
  testCreateSqlite,
  testCreateTimingSafeEqual,
  testOwner,
  testOwner2,
  testOwnerBinaryId,
  testRandom,
} from "../_deps.js";
import { testTimestampsAsc } from "./_fixtures.js";

const createTestRelayStorage = async () => {
  const sqlite = await testCreateSqlite();
  const storage = getOrThrow(
    createRelayStorage({
      sqlite,
      random: testRandom,
      timingSafeEqual: testCreateTimingSafeEqual(),
    })({
      onStorageError: constVoid,
    }),
  );
  return [storage, sqlite] as const;
};

test("validateWriteKey", async () => {
  const [storage] = await createTestRelayStorage();

  const writeKey = testOwner.writeKey;
  const differentWriteKey = testOwner2.writeKey;

  // New owner
  const result1 = storage.validateWriteKey(testOwnerBinaryId, writeKey);
  expect(result1).toBe(true);

  // Existing owner, same write key
  const result2 = storage.validateWriteKey(testOwnerBinaryId, writeKey);
  expect(result2).toBe(true);

  // Existing owner ID, different write key
  const result3 = storage.validateWriteKey(
    testOwnerBinaryId,
    differentWriteKey,
  );
  expect(result3).toBe(false);
});

test("deleteOwner", async () => {
  const [storage, sqlite] = await createTestRelayStorage();

  storage.setWriteKey(testOwnerBinaryId, testOwner.writeKey);

  const message: EncryptedCrdtMessage = {
    timestamp: binaryTimestampToTimestamp(testTimestampsAsc[0]),
    change: new Uint8Array([1, 2, 3]) as EncryptedDbChange,
  };

  await storage.writeMessages(testOwnerBinaryId, [message]);

  expect(storage.getSize(testOwnerBinaryId)).toBe(1);

  const deleteResult = storage.deleteOwner(testOwnerBinaryId);
  expect(deleteResult).toBe(true);

  for (const table of ["evolu_timestamp", "evolu_message", "evolu_writeKey"]) {
    const countResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from ${sql.raw(table)}
      where ownerId = ${testOwnerBinaryId};
    `);
    expect(countResult.ok && countResult.value.rows[0].count).toBe(0);
  }
});
