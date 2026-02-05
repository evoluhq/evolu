import { assert, describe, expect, test } from "vitest";
import type {
  NonNegativeInt,
  OwnerIdBytes,
  SqliteDep,
} from "../../src/index.js";
import {
  err,
  lazyFalse,
  setTimeout,
  sql,
  timestampBytesToTimestamp,
} from "../../src/index.js";
import type {
  EncryptedCrdtMessage,
  EncryptedDbChange,
} from "../../src/local-first/Storage.js";
import { createInitialTimestamp } from "../../src/local-first/Timestamp.js";
import { testCreateDeps } from "../../src/Test.js";
import { testCreateRunWithRelayStorage } from "../_deps.js";
import {
  testAppOwner,
  testAppOwner2,
  testAppOwnerIdBytes,
  testAppOwner2IdBytes,
  testTimestampsAsc,
} from "./_fixtures.js";

test("validateWriteKey", async () => {
  await using run = await testCreateRunWithRelayStorage();
  const { storage } = run.deps;

  const writeKey = testAppOwner.writeKey;
  const differentWriteKey = testAppOwner2.writeKey;

  // New owner
  const result1 = storage.validateWriteKey(testAppOwnerIdBytes, writeKey);
  expect(result1).toBe(true);

  // Existing owner, same write key
  const result2 = storage.validateWriteKey(testAppOwnerIdBytes, writeKey);
  expect(result2).toBe(true);

  // Existing owner ID, different write key
  const result3 = storage.validateWriteKey(
    testAppOwnerIdBytes,
    differentWriteKey,
  );
  expect(result3).toBe(false);
});

test("deleteOwner", async () => {
  await using run = await testCreateRunWithRelayStorage();
  const { storage, sqlite } = run.deps;

  storage.setWriteKey(testAppOwnerIdBytes, testAppOwner.writeKey);

  const message: EncryptedCrdtMessage = {
    timestamp: timestampBytesToTimestamp(testTimestampsAsc[0]),
    change: new Uint8Array([1, 2, 3]) as EncryptedDbChange,
  };

  await run(storage.writeMessages(testAppOwnerIdBytes, [message]));

  expect(storage.getSize(testAppOwnerIdBytes)).toBe(1);

  const deleteResult = storage.deleteOwner(testAppOwnerIdBytes);
  expect(deleteResult).toBe(true);

  for (const table of ["evolu_timestamp", "evolu_message", "evolu_writeKey"]) {
    const countResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from ${sql.raw(table)}
      where ownerid = ${testAppOwnerIdBytes};
    `);
    expect(countResult.ok && countResult.value.rows[0].count).toBe(0);
  }
});

describe("writeMessages", () => {
  const deps = testCreateDeps();
  const createTestMessage = (length = 3): EncryptedCrdtMessage => ({
    timestamp: createInitialTimestamp(deps),
    change: new Uint8Array(length) as EncryptedDbChange,
  });

  const getStoredBytes =
    (deps: SqliteDep) =>
    (ownerId: OwnerIdBytes): NonNegativeInt => {
      const usageResult = deps.sqlite.exec(sql`
        select storedbytes
        from evolu_usage
        where ownerid = ${ownerId};
      `);
      assert(usageResult.ok);
      return usageResult.value.rows[0].storedBytes as NonNegativeInt;
    };

  const message = createTestMessage();

  test("calculates storedBytes correctly", async () => {
    await using run = await testCreateRunWithRelayStorage();
    const { storage, sqlite } = run.deps;

    await run(storage.writeMessages(testAppOwnerIdBytes, [message]));

    expect(getStoredBytes({ sqlite })(testAppOwnerIdBytes)).toBe(3);
  });

  test("accumulates storedBytes across multiple writes", async () => {
    await using run = await testCreateRunWithRelayStorage();
    const { storage, sqlite } = run.deps;

    await run(storage.writeMessages(testAppOwnerIdBytes, [message]));
    await run(storage.writeMessages(testAppOwnerIdBytes, [message]));

    expect(getStoredBytes({ sqlite })(testAppOwnerIdBytes)).toBe(6);
  });

  test("prevents duplicate timestamp writes", async () => {
    await using run = await testCreateRunWithRelayStorage();
    const { storage, sqlite } = run.deps;

    const result1 = await run(
      storage.writeMessages(testAppOwnerIdBytes, [message]),
    );
    assert(result1.ok);

    const result2 = await run(
      storage.writeMessages(testAppOwnerIdBytes, [message]),
    );
    assert(result2.ok);

    const countResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_message
      where ownerid = ${testAppOwnerIdBytes};
    `);

    assert(countResult.ok);
    expect(countResult.value.rows[0].count).toBe(1);
  });

  test("mutex prevents concurrent writes for same owner", async () => {
    let concurrentAccess = false;
    let activeWrites = 0;

    await using run = await testCreateRunWithRelayStorage({
      isOwnerWithinQuota: async (_ownerId, _requiredBytes) => {
        activeWrites++;
        if (activeWrites > 1) {
          concurrentAccess = true;
        }
        await setTimeout("1ms");
        activeWrites--;
        return true;
      },
    });
    const { storage } = run.deps;

    const message1 = createTestMessage();
    const message2 = createTestMessage();

    await Promise.all([
      run(storage.writeMessages(testAppOwnerIdBytes, [message1])),
      run(storage.writeMessages(testAppOwnerIdBytes, [message2])),
    ]);

    expect(concurrentAccess).toBe(false);
    expect(storage.getSize(testAppOwnerIdBytes)).toBe(2);
  });

  test("allows concurrent writes for different owners", async () => {
    let activeWrites = 0;
    let maxConcurrentWrites = 0;

    await using run = await testCreateRunWithRelayStorage({
      isOwnerWithinQuota: async (_ownerId, _requiredBytes) => {
        activeWrites++;
        maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
        await setTimeout("1ms");
        activeWrites--;
        return true;
      },
    });
    const { storage } = run.deps;

    const message1 = createTestMessage();
    const message2 = createTestMessage();

    await Promise.all([
      run(storage.writeMessages(testAppOwnerIdBytes, [message1])),
      run(storage.writeMessages(testAppOwner2IdBytes, [message2])),
    ]);

    expect(maxConcurrentWrites).toBe(2);
    expect(storage.getSize(testAppOwnerIdBytes)).toBe(1);
    expect(storage.getSize(testAppOwner2IdBytes)).toBe(1);
  });

  test("transaction rollback on quota error", async () => {
    await using run = await testCreateRunWithRelayStorage({
      isOwnerWithinQuota: lazyFalse,
    });
    const { storage, sqlite } = run.deps;

    const result = await run(
      storage.writeMessages(testAppOwnerIdBytes, [message]),
    );

    expect(result).toEqual(
      err({ type: "StorageQuotaError", ownerId: testAppOwner.id }),
    );

    const messageCountResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_message
      where ownerid = ${testAppOwnerIdBytes};
    `);

    assert(messageCountResult.ok);
    expect(messageCountResult.value.rows[0].count).toBe(0);

    const usageResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_usage
      where ownerid = ${testAppOwnerIdBytes};
    `);

    assert(usageResult.ok);
    expect(usageResult.value.rows[0].count).toBe(0);
  });

  describe("isOwnerWithinQuota", () => {
    test("succeeds when isOwnerWithinQuota returns true", async () => {
      let quotaCheckCalled = false;
      let receivedOwnerId = "";
      let receivedBytes = 0;

      await using run = await testCreateRunWithRelayStorage({
        isOwnerWithinQuota: (ownerId, requiredBytes) => {
          quotaCheckCalled = true;
          receivedOwnerId = ownerId;
          receivedBytes = requiredBytes;
          return true;
        },
      });
      const { storage } = run.deps;

      const result = await run(
        storage.writeMessages(testAppOwnerIdBytes, [message]),
      );

      assert(result.ok);
      expect(quotaCheckCalled).toBe(true);
      expect(receivedOwnerId).toBe(testAppOwner.id);
      expect(receivedBytes).toBe(3);
    });

    test("succeeds when async isOwnerWithinQuota returns true", async () => {
      let quotaCheckCalled = false;
      let receivedOwnerId = "";
      let receivedBytes = 0;

      await using run = await testCreateRunWithRelayStorage({
        isOwnerWithinQuota: async (ownerId, requiredBytes) => {
          await setTimeout("1ms");
          quotaCheckCalled = true;
          receivedOwnerId = ownerId;
          receivedBytes = requiredBytes;
          return true;
        },
      });
      const { storage } = run.deps;

      const result = await run(
        storage.writeMessages(testAppOwnerIdBytes, [message]),
      );

      assert(result.ok);
      expect(quotaCheckCalled).toBe(true);
      expect(receivedOwnerId).toBe(testAppOwner.id);
      expect(receivedBytes).toBe(3);
    });

    test("fails when isOwnerWithinQuota returns false", async () => {
      await using run = await testCreateRunWithRelayStorage({
        isOwnerWithinQuota: lazyFalse,
      });
      const { storage } = run.deps;

      const result = await run(
        storage.writeMessages(testAppOwnerIdBytes, [message]),
      );

      expect(result).toEqual(
        err({ type: "StorageQuotaError", ownerId: testAppOwner.id }),
      );
    });

    test("fails when async isOwnerWithinQuota returns false", async () => {
      await using run = await testCreateRunWithRelayStorage({
        isOwnerWithinQuota: async () => {
          await setTimeout("1ms");
          return false;
        },
      });
      const { storage } = run.deps;

      const result = await run(
        storage.writeMessages(testAppOwnerIdBytes, [message]),
      );

      expect(result).toEqual(
        err({ type: "StorageQuotaError", ownerId: testAppOwner.id }),
      );
    });

    test("with quota check based on cumulative bytes", async () => {
      const quotaLimit = 100;

      await using run = await testCreateRunWithRelayStorage({
        isOwnerWithinQuota: (_ownerId, requiredBytes) =>
          requiredBytes <= quotaLimit,
      });
      const { storage, sqlite } = run.deps;

      const message1 = createTestMessage(50);
      const result1 = await run(
        storage.writeMessages(testAppOwnerIdBytes, [message1]),
      );
      assert(result1.ok);

      const message2 = createTestMessage(40);
      const result2 = await run(
        storage.writeMessages(testAppOwnerIdBytes, [message2]),
      );
      assert(result2.ok);

      const largeMessage = createTestMessage(20);
      const result3 = await run(
        storage.writeMessages(testAppOwnerIdBytes, [largeMessage]),
      );
      expect(result3).toEqual(
        err({ type: "StorageQuotaError", ownerId: testAppOwner.id }),
      );

      expect(getStoredBytes({ sqlite })(testAppOwnerIdBytes)).toBe(90);
    });
  });
});
