import { expect, test } from "vitest";
import { createRelayStorage } from "../../src/Evolu/Relay.js";
import { constVoid } from "../../src/Function.js";
import { getOrThrow } from "../../src/Result.js";
import {
  testCreateSqlite,
  testOwner,
  testOwner2,
  testOwnerBinaryId,
  testRandom,
} from "../_deps.js";

test("createRelayStorage", async () => {
  const sqlite = await testCreateSqlite();

  const storage = getOrThrow(
    createRelayStorage({ sqlite, random: testRandom })({
      onStorageError: constVoid,
    }),
  );

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
