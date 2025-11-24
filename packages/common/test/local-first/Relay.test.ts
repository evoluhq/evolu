import { assert, describe, expect, test } from "vitest";
import {
  EncryptedCrdtMessage,
  EncryptedDbChange,
} from "../../src/local-first/Storage.js";
import { createInitialTimestamp } from "../../src/local-first/Timestamp.js";
import {
  constFalse,
  err,
  NonNegativeInt,
  OwnerIdBytes,
  sql,
  SqliteDep,
  timestampBytesToTimestamp,
  wait,
} from "../../src/index.js";
import {
  testCreateRelayStorageAndSqliteDeps,
  testDeps,
  testOwner,
  testOwner2,
  testOwnerIdBytes,
  testOwnerIdBytes2,
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

describe("writeMessages", () => {
  const createTestMessage = (length = 3): EncryptedCrdtMessage => ({
    timestamp: createInitialTimestamp(testDeps),
    change: new Uint8Array(length) as EncryptedDbChange,
  });

  const getStoredBytes =
    (deps: SqliteDep) =>
    (ownerId: OwnerIdBytes): NonNegativeInt => {
      const usageResult = deps.sqlite.exec(sql`
        select storedBytes
        from evolu_usage
        where ownerId = ${ownerId};
      `);
      assert(usageResult.ok);
      return usageResult.value.rows[0].storedBytes as NonNegativeInt;
    };

  const message = createTestMessage();

  test("calculates storedBytes correctly", async () => {
    const { storage, sqlite } = await testCreateRelayStorageAndSqliteDeps();

    await storage.writeMessages(testOwnerIdBytes, [message]);

    expect(getStoredBytes({ sqlite })(testOwnerIdBytes)).toBe(3);
  });

  test("accumulates storedBytes across multiple writes", async () => {
    const { storage, sqlite } = await testCreateRelayStorageAndSqliteDeps();

    await storage.writeMessages(testOwnerIdBytes, [message]);
    await storage.writeMessages(testOwnerIdBytes, [message]);

    expect(getStoredBytes({ sqlite })(testOwnerIdBytes)).toBe(6);
  });

  test("prevents duplicate timestamp writes", async () => {
    const { storage, sqlite } = await testCreateRelayStorageAndSqliteDeps();

    const result1 = await storage.writeMessages(testOwnerIdBytes, [message]);
    assert(result1.ok);

    const result2 = await storage.writeMessages(testOwnerIdBytes, [message]);
    assert(result2.ok);

    const countResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_message
      where ownerId = ${testOwnerIdBytes};
    `);

    assert(countResult.ok);
    expect(countResult.value.rows[0].count).toBe(1);
  });

  test("mutex prevents concurrent writes for same owner", async () => {
    let concurrentAccess = false;
    let activeWrites = 0;

    const { storage } = await testCreateRelayStorageAndSqliteDeps({
      isOwnerWithinQuota: async (_ownerId, _requiredBytes) => {
        activeWrites++;
        if (activeWrites > 1) {
          concurrentAccess = true;
        }
        await wait("1ms")(); // Simulate some work
        activeWrites--;
        return true;
      },
    });

    const message1 = createTestMessage();
    const message2 = createTestMessage();

    await Promise.all([
      storage.writeMessages(testOwnerIdBytes, [message1]),
      storage.writeMessages(testOwnerIdBytes, [message2]),
    ]);

    expect(concurrentAccess).toBe(false);
    expect(storage.getSize(testOwnerIdBytes)).toBe(2);
  });

  test("allows concurrent writes for different owners", async () => {
    let activeWrites = 0;
    let maxConcurrentWrites = 0;

    const { storage } = await testCreateRelayStorageAndSqliteDeps({
      isOwnerWithinQuota: async (_ownerId, _requiredBytes) => {
        activeWrites++;
        maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
        await wait("1ms")(); // Simulate some work
        activeWrites--;
        return true;
      },
    });

    const message1 = createTestMessage();
    const message2 = createTestMessage();

    await Promise.all([
      storage.writeMessages(testOwnerIdBytes, [message1]),
      storage.writeMessages(testOwnerIdBytes2, [message2]),
    ]);

    expect(maxConcurrentWrites).toBe(2); // Both writes should be active simultaneously
    expect(storage.getSize(testOwnerIdBytes)).toBe(1);
    expect(storage.getSize(testOwnerIdBytes2)).toBe(1);
  });

  test("transaction rollback on quota error", async () => {
    const { storage, sqlite } = await testCreateRelayStorageAndSqliteDeps({
      isOwnerWithinQuota: constFalse,
    });

    const result = await storage.writeMessages(testOwnerIdBytes, [message]);

    expect(result).toEqual(
      err({ type: "StorageQuotaError", ownerId: testOwner.id }),
    );

    const messageCountResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_message
      where ownerId = ${testOwnerIdBytes};
    `);

    assert(messageCountResult.ok);
    expect(messageCountResult.value.rows[0].count).toBe(0);

    const usageResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_usage
      where ownerId = ${testOwnerIdBytes};
    `);

    assert(usageResult.ok);
    expect(usageResult.value.rows[0].count).toBe(0);
  });

  describe("isOwnerWithinQuota", () => {
    test("succeeds when isOwnerWithinQuota returns true", async () => {
      let quotaCheckCalled = false;
      let receivedOwnerId = "";
      let receivedBytes = 0;

      const { storage } = await testCreateRelayStorageAndSqliteDeps({
        isOwnerWithinQuota: (ownerId, requiredBytes) => {
          quotaCheckCalled = true;
          receivedOwnerId = ownerId;
          receivedBytes = requiredBytes;
          return true;
        },
      });

      const result = await storage.writeMessages(testOwnerIdBytes, [message]);

      assert(result.ok);
      expect(quotaCheckCalled).toBe(true);
      expect(receivedOwnerId).toBe(testOwner.id);
      expect(receivedBytes).toBe(3);
    });

    test("succeeds when async isOwnerWithinQuota returns true", async () => {
      let quotaCheckCalled = false;
      let receivedOwnerId = "";
      let receivedBytes = 0;

      const { storage } = await testCreateRelayStorageAndSqliteDeps({
        isOwnerWithinQuota: async (ownerId, requiredBytes) => {
          await wait("1ms")();
          quotaCheckCalled = true;
          receivedOwnerId = ownerId;
          receivedBytes = requiredBytes;
          return true;
        },
      });

      const result = await storage.writeMessages(testOwnerIdBytes, [message]);

      assert(result.ok);
      expect(quotaCheckCalled).toBe(true);
      expect(receivedOwnerId).toBe(testOwner.id);
      expect(receivedBytes).toBe(3);
    });

    test("fails when isOwnerWithinQuota returns false", async () => {
      const { storage } = await testCreateRelayStorageAndSqliteDeps({
        isOwnerWithinQuota: constFalse,
      });

      const result = await storage.writeMessages(testOwnerIdBytes, [message]);

      expect(result).toEqual(
        err({ type: "StorageQuotaError", ownerId: testOwner.id }),
      );
    });

    test("fails when async isOwnerWithinQuota returns false", async () => {
      const { storage } = await testCreateRelayStorageAndSqliteDeps({
        isOwnerWithinQuota: async () => {
          await wait("1ms")();
          return false;
        },
      });

      const result = await storage.writeMessages(testOwnerIdBytes, [message]);

      expect(result).toEqual(
        err({ type: "StorageQuotaError", ownerId: testOwner.id }),
      );
    });

    test("with quota check based on cumulative bytes", async () => {
      const quotaLimit = 100;

      const { storage, sqlite } = await testCreateRelayStorageAndSqliteDeps({
        isOwnerWithinQuota: (_ownerId, requiredBytes) =>
          requiredBytes <= quotaLimit,
      });

      const message1 = createTestMessage(50);
      const result1 = await storage.writeMessages(testOwnerIdBytes, [message1]);
      assert(result1.ok);

      const message2 = createTestMessage(40);
      const result2 = await storage.writeMessages(testOwnerIdBytes, [message2]);
      assert(result2.ok);

      const largeMessage = createTestMessage(20);
      const result3 = await storage.writeMessages(testOwnerIdBytes, [
        largeMessage,
      ]);
      expect(result3).toEqual(
        err({ type: "StorageQuotaError", ownerId: testOwner.id }),
      );

      expect(getStoredBytes({ sqlite })(testOwnerIdBytes)).toBe(90);
    });
  });
});
