import { describe, it, test } from "node:test";
import type {
  NonNegativeInt,
  OwnerIdBytes,
  SqliteDep,
} from "../../../../../packages/common/src/index.ts";
import {
  assertEqual,
  assertEqualBytes,
  assertErr,
  assertFalse,
  assertThrowsInstanceOf,
  assertTrue,
  err,
  constFalse,
  sql,
  timestampToTimestampBytes,
} from "../../../../../packages/common/src/index.ts";
import {
  createAppOwner,
  createOwnerSecret,
  ownerIdToOwnerIdBytes,
  testAppOwner,
} from "../../../../../packages/common/src/local-first/Owner.ts";
import type {
  EncryptedCrdtMessage,
  EncryptedDbChange,
} from "../../../../../packages/common/src/local-first/Storage.ts";
import {
  createInitialTimestamp,
  createTimestamp,
} from "../../../../../packages/common/src/local-first/Timestamp.ts";
import { installPolyfills } from "../../../../../packages/common/src/Polyfills.ts";
import {
  testCreateDeps,
  testCreateRun,
} from "../../../../../packages/common/src/Task.ts";
import { setupSqliteAndRelayStorage } from "../../_deps.ts";

const testAppOwner2 = createAppOwner(
  createOwnerSecret(testCreateDeps({ seed: "testAppOwner2" })),
);
const testAppOwnerIdBytes = ownerIdToOwnerIdBytes(testAppOwner.id);
const testAppOwner2IdBytes = ownerIdToOwnerIdBytes(testAppOwner2.id);
const testTimestamp = createTimestamp();

installPolyfills();

test("validateWriteKey", async () => {
  await using setup = await setupSqliteAndRelayStorage();
  const { storage } = setup;

  const writeKey = testAppOwner.writeKey;
  const differentWriteKey = testAppOwner2.writeKey;

  // New owner
  const result1 = storage.validateWriteKey(testAppOwnerIdBytes, writeKey);
  assertTrue(result1);

  // Existing owner, same write key
  const result2 = storage.validateWriteKey(testAppOwnerIdBytes, writeKey);
  assertTrue(result2);

  // Existing owner ID, different write key
  const result3 = storage.validateWriteKey(
    testAppOwnerIdBytes,
    differentWriteKey,
  );
  assertFalse(result3);
});

test("deleteOwner", async () => {
  await using setup = await setupSqliteAndRelayStorage();
  const { run, storage, sqlite } = setup;

  storage.setWriteKey(testAppOwnerIdBytes, testAppOwner.writeKey);

  const message: EncryptedCrdtMessage = {
    timestamp: testTimestamp,
    change: new Uint8Array([1, 2, 3]) as EncryptedDbChange,
  };

  await run(storage.writeMessages(testAppOwnerIdBytes, [message]));

  assertEqual(storage.getSize(testAppOwnerIdBytes), 1);

  storage.deleteOwner(testAppOwnerIdBytes);

  for (const table of ["evolu_timestamp", "evolu_message", "evolu_writeKey"]) {
    const countResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from ${sql.raw(table)}
      where ownerid = ${testAppOwnerIdBytes};
    `);
    assertEqual(countResult.rows[0].count, 0);
  }
});

test("readDbChange returns stored encrypted change", async () => {
  await using setup = await setupSqliteAndRelayStorage();
  const { run, storage } = setup;

  const message: EncryptedCrdtMessage = {
    timestamp: testTimestamp,
    change: new Uint8Array([1, 2, 3]) as EncryptedDbChange,
  };

  await run.orThrow(storage.writeMessages(testAppOwnerIdBytes, [message]));

  assertEqualBytes(
    storage.readDbChange(
      testAppOwnerIdBytes,
      timestampToTimestampBytes(message.timestamp),
    ),
    message.change,
  );
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
      return usageResult.rows[0].storedBytes as NonNegativeInt;
    };

  const message = createTestMessage();

  it("calculates storedBytes correctly", async () => {
    await using setup = await setupSqliteAndRelayStorage();
    const { run, storage, sqlite } = setup;

    await run(storage.writeMessages(testAppOwnerIdBytes, [message]));

    assertEqual(getStoredBytes({ sqlite })(testAppOwnerIdBytes), 3);
  });

  it("accumulates storedBytes across multiple writes", async () => {
    await using setup = await setupSqliteAndRelayStorage();
    const { run, storage, sqlite } = setup;

    await run(storage.writeMessages(testAppOwnerIdBytes, [message]));
    await run(storage.writeMessages(testAppOwnerIdBytes, [message]));

    assertEqual(getStoredBytes({ sqlite })(testAppOwnerIdBytes), 3);
  });

  it("prevents duplicate timestamp writes", async () => {
    await using setup = await setupSqliteAndRelayStorage();
    const { run, storage, sqlite } = setup;

    await run.orThrow(storage.writeMessages(testAppOwnerIdBytes, [message]));

    await run.orThrow(storage.writeMessages(testAppOwnerIdBytes, [message]));

    const countResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_message
      where ownerid = ${testAppOwnerIdBytes};
    `);

    assertEqual(countResult.rows[0].count, 1);
    assertEqual(getStoredBytes({ sqlite })(testAppOwnerIdBytes), 3);
  });

  it("deduplicates duplicate timestamps within the same write batch", async () => {
    await using setup = await setupSqliteAndRelayStorage();
    const { run, storage, sqlite } = setup;

    await run.orThrow(
      storage.writeMessages(testAppOwnerIdBytes, [message, message]),
    );

    const countResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_message
      where ownerid = ${testAppOwnerIdBytes};
    `);

    assertEqual(countResult.rows[0].count, 1);
    assertEqual(getStoredBytes({ sqlite })(testAppOwnerIdBytes), 3);
  });

  it("mutex prevents concurrent writes for same owner", async () => {
    let concurrentAccess = false;
    let activeWrites = 0;

    await using setup = await setupSqliteAndRelayStorage({
      isOwnerWithinQuota: async (_ownerId, _requiredBytes) => {
        activeWrites++;
        if (activeWrites > 1) {
          concurrentAccess = true;
        }
        await Promise.resolve();
        activeWrites--;
        return true;
      },
    });
    const { run, storage } = setup;

    const message1 = createTestMessage();
    const message2 = createTestMessage();

    await Promise.all([
      run(storage.writeMessages(testAppOwnerIdBytes, [message1])),
      run(storage.writeMessages(testAppOwnerIdBytes, [message2])),
    ]);

    assertFalse(concurrentAccess);
    assertEqual(storage.getSize(testAppOwnerIdBytes), 2);
  });

  it("allows concurrent writes for different owners", async () => {
    let activeWrites = 0;
    let maxConcurrentWrites = 0;

    await using setup = await setupSqliteAndRelayStorage({
      isOwnerWithinQuota: async (_ownerId, _requiredBytes) => {
        activeWrites++;
        maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
        await Promise.resolve();
        activeWrites--;
        return true;
      },
    });
    const { run, storage } = setup;

    const message1 = createTestMessage();
    const message2 = createTestMessage();

    await Promise.all([
      run(storage.writeMessages(testAppOwnerIdBytes, [message1])),
      run(storage.writeMessages(testAppOwner2IdBytes, [message2])),
    ]);

    assertEqual(maxConcurrentWrites, 2);
    assertEqual(storage.getSize(testAppOwnerIdBytes), 1);
    assertEqual(storage.getSize(testAppOwner2IdBytes), 1);
  });

  it("transaction rollback on quota error", async () => {
    await using setup = await setupSqliteAndRelayStorage({
      isOwnerWithinQuota: constFalse,
    });
    const { run, storage, sqlite } = setup;

    const result = await run(
      storage.writeMessages(testAppOwnerIdBytes, [message]),
    );

    assertErr(result, { type: "StorageQuotaError", ownerId: testAppOwner.id });

    const messageCountResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_message
      where ownerid = ${testAppOwnerIdBytes};
    `);

    assertEqual(messageCountResult.rows[0].count, 0);

    const usageResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_usage
      where ownerid = ${testAppOwnerIdBytes};
    `);

    assertEqual(usageResult.rows[0].count, 0);
  });

  it("throws when write starts on disposed run", async () => {
    await using setup = await setupSqliteAndRelayStorage();
    const { storage, sqlite } = setup;

    await using run = testCreateRun();
    await run[Symbol.asyncDispose]();

    assertEqual(
      assertThrowsInstanceOf(
        () => run(storage.writeMessages(testAppOwnerIdBytes, [message])),
        Error,
      ).message,
      "Cannot use a disposed object.",
    );

    const messageCountResult = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_message
      where ownerid = ${testAppOwnerIdBytes};
    `);

    assertEqual(messageCountResult.rows[0].count, 0);
  });

  describe("isOwnerWithinQuota", () => {
    it("succeeds when isOwnerWithinQuota returns true", async () => {
      let quotaCheckCalled = false;
      let receivedOwnerId = "";
      let receivedBytes = 0;

      await using setup = await setupSqliteAndRelayStorage({
        isOwnerWithinQuota: (ownerId, requiredBytes) => {
          quotaCheckCalled = true;
          receivedOwnerId = ownerId;
          receivedBytes = requiredBytes;
          return true;
        },
      });
      const { run, storage } = setup;

      await run.orThrow(storage.writeMessages(testAppOwnerIdBytes, [message]));
      assertTrue(quotaCheckCalled);
      assertEqual(receivedOwnerId, testAppOwner.id);
      assertEqual(receivedBytes, 3);
    });

    it("succeeds when async isOwnerWithinQuota returns true", async () => {
      let quotaCheckCalled = false;
      let receivedOwnerId = "";
      let receivedBytes = 0;

      await using setup = await setupSqliteAndRelayStorage({
        isOwnerWithinQuota: async (ownerId, requiredBytes) => {
          await Promise.resolve();
          quotaCheckCalled = true;
          receivedOwnerId = ownerId;
          receivedBytes = requiredBytes;
          return true;
        },
      });
      const { run, storage } = setup;

      await run.orThrow(storage.writeMessages(testAppOwnerIdBytes, [message]));
      assertTrue(quotaCheckCalled);
      assertEqual(receivedOwnerId, testAppOwner.id);
      assertEqual(receivedBytes, 3);
    });

    it("fails when isOwnerWithinQuota returns false", async () => {
      await using setup = await setupSqliteAndRelayStorage({
        isOwnerWithinQuota: constFalse,
      });
      const { run, storage } = setup;

      const result = await run(
        storage.writeMessages(testAppOwnerIdBytes, [message]),
      );

      assertErr(result, {
        type: "StorageQuotaError",
        ownerId: testAppOwner.id,
      });
    });

    it("fails when async isOwnerWithinQuota returns false", async () => {
      await using setup = await setupSqliteAndRelayStorage({
        isOwnerWithinQuota: async () => {
          await Promise.resolve();
          return false;
        },
      });
      const { run, storage } = setup;

      const result = await run(
        storage.writeMessages(testAppOwnerIdBytes, [message]),
      );

      assertErr(result, {
        type: "StorageQuotaError",
        ownerId: testAppOwner.id,
      });
    });

    it("with quota check based on cumulative bytes", async () => {
      const quotaLimit = 100;

      await using setup = await setupSqliteAndRelayStorage({
        isOwnerWithinQuota: (_ownerId, requiredBytes) =>
          requiredBytes <= quotaLimit,
      });
      const { run, storage, sqlite } = setup;

      const message1 = createTestMessage(50);
      await run.orThrow(storage.writeMessages(testAppOwnerIdBytes, [message1]));

      const message2 = createTestMessage(40);
      await run.orThrow(storage.writeMessages(testAppOwnerIdBytes, [message2]));

      const largeMessage = createTestMessage(20);
      const result3 = await run(
        storage.writeMessages(testAppOwnerIdBytes, [largeMessage]),
      );
      assertEqual(
        result3,
        err({ type: "StorageQuotaError", ownerId: testAppOwner.id }),
      );

      assertEqual(getStoredBytes({ sqlite })(testAppOwnerIdBytes), 90);
    });
  });
});
