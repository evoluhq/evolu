import { describe, it, test } from "node:test";
import type {
  Millis,
  NonEmptyReadonlyArray,
  NonNegativeInt,
  OwnerIdBytes,
  RandomNumber,
  SqliteDep,
} from "../../../../../packages/common/src/index.ts";
import {
  assertEqual,
  assertEqualBytes,
  assertErr,
  assertFalse,
  assertOk,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
  err,
  mapArray,
  constFalse,
  constTrue,
  ok,
  sql,
  testSetupSqlite,
  timestampToTimestampBytes,
  UnknownError,
} from "../../../../../packages/common/src/index.ts";
import {
  createAppOwner,
  createOwnerSecret,
  ownerIdToOwnerIdBytes,
  testAppOwner,
} from "../../../../../packages/common/src/local-first/Owner.ts";
import {
  applyProtocolMessageAsClient,
  applyProtocolMessageAsRelay,
  createProtocolMessageBuffer,
  MessageType,
} from "../../../../../packages/common/src/local-first/Protocol.ts";
import {
  createRelaySqliteStorage,
  createRelayStorageTables,
} from "../../../../../packages/common/src/local-first/Relay.ts";
import {
  createBaseSqliteStorageTables,
  type EncryptedCrdtMessage,
  type EncryptedDbChange,
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
import {
  setupInterceptedSqlite,
  setupSqlite,
  setupSqliteAndRelayStorage,
  testCreateSqliteDep,
  testTimingSafeEqual,
} from "../../_deps.ts";

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

  // The first use of a write key stores it.
  assertTrue(
    storage.validateWriteKey(testAppOwnerIdBytes, testAppOwner.writeKey),
  );

  const message: EncryptedCrdtMessage = {
    timestamp: testTimestamp,
    change: new Uint8Array([1, 2, 3]) as EncryptedDbChange,
  };

  await run(storage.writeMessages(testAppOwnerIdBytes, [message]));

  assertEqual(storage.getSize(testAppOwnerIdBytes), 1);

  storage.deleteOwner(testAppOwnerIdBytes);

  for (const table of [
    "evolu_timestamp",
    "evolu_message",
    "evolu_writeKey",
    "evolu_usage",
  ]) {
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

  it("stores an owner's first batch of empty changes without a panic", async () => {
    await using setup = await setupSqliteAndRelayStorage();
    const { run, storage, sqlite } = setup;

    await run.orThrow(
      storage.writeMessages(testAppOwnerIdBytes, [createTestMessage(0)]),
    );
    assertEqual(getStoredBytes({ sqlite })(testAppOwnerIdBytes), 0);

    // The Run survives, so later writes still work.
    await run.orThrow(
      storage.writeMessages(testAppOwnerIdBytes, [createTestMessage()]),
    );
    assertEqual(getStoredBytes({ sqlite })(testAppOwnerIdBytes), 3);
  });

  it("accumulates storedBytes across multiple writes", async () => {
    await using setup = await setupSqliteAndRelayStorage();
    const { run, storage, sqlite } = setup;

    await run(storage.writeMessages(testAppOwnerIdBytes, [message]));
    await run(storage.writeMessages(testAppOwnerIdBytes, [message]));

    assertEqual(getStoredBytes({ sqlite })(testAppOwnerIdBytes), 3);
  });

  // Earlier releases choose their insert path from the stored bounds.
  it("keeps an owner's first and last timestamps in its usage", async () => {
    await using setup = await setupSqliteAndRelayStorage();
    const { run, storage, sqlite } = setup;
    const timestampAt = (millis: number) =>
      createTimestamp({ millis: millis as Millis });

    const cases: ReadonlyArray<{
      written: NonEmptyReadonlyArray<number>;
      first: number;
      last: number;
    }> = [
      // A new owner.
      { written: [20], first: 20, last: 20 },
      // Appended, prepended, and between.
      { written: [30], first: 20, last: 30 },
      { written: [10], first: 10, last: 30 },
      { written: [25], first: 10, last: 30 },
      { written: [40, 5, 15], first: 5, last: 40 },
    ];
    for (const { written, first, last } of cases) {
      await run.orThrow(
        storage.writeMessages(
          testAppOwnerIdBytes,
          mapArray(written, (millis) => ({
            timestamp: timestampAt(millis),
            change: new Uint8Array(1) as EncryptedDbChange,
          })),
        ),
      );
      assertEqual(
        sqlite.exec(sql`
          select "firstTimestamp", "lastTimestamp"
          from evolu_usage
          where "ownerId" = ${testAppOwnerIdBytes};
        `).rows,
        [
          {
            firstTimestamp: timestampToTimestampBytes(timestampAt(first)),
            lastTimestamp: timestampToTimestampBytes(timestampAt(last)),
          },
        ],
      );
    }
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

  it("runs every statement of a write and a read on a kept statement", async () => {
    let execs = 0;
    await using setup = await testSetupSqlite({
      createSqliteDriver: (name, options) => async (run) => {
        const driver = await run.ok(
          testCreateSqliteDep.createSqliteDriver(name, options),
        );
        return ok({
          ...driver,
          exec: (query) => {
            execs++;
            return driver.exec(query);
          },
        });
      },
    });
    const { sqlite } = setup;
    createBaseSqliteStorageTables({ sqlite });
    createRelayStorageTables({ sqlite });
    const storage = createRelaySqliteStorage({
      ...setup.run.deps,
      sqlite,
      timingSafeEqual: testTimingSafeEqual,
    })({ isOwnerWithinQuota: constTrue });
    await using run = testCreateRun();
    const writeAndRead = async (count: number) => {
      const messages = [
        createTestMessage(),
        ...Array.from({ length: count - 1 }, () => createTestMessage()),
      ] as const;
      execs = 0;
      assertTrue(
        storage.validateWriteKey(testAppOwnerIdBytes, testAppOwner.writeKey),
      );
      await run.orThrow(storage.writeMessages(testAppOwnerIdBytes, messages));
      for (const { timestamp } of messages) {
        storage.readDbChange(
          testAppOwnerIdBytes,
          timestampToTimestampBytes(timestamp),
        );
      }
      return execs;
    };

    assertEqual(await writeAndRead(10), 0);
    assertEqual(await writeAndRead(1), 0);
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

  it("rolls back a write whose skiplist insert fails after writing part of it", async () => {
    await using setup = await setupSqlite();
    const { sqlite } = setup;
    createBaseSqliteStorageTables({ sqlite });
    createRelayStorageTables({ sqlite });
    // The first timestamp at level 2, then each at level 1.
    const randomNumbers = [0.1, 0.9];
    const storage = createRelaySqliteStorage({
      ...setup.run.deps,
      random: { next: () => (randomNumbers.shift() ?? 0.9) as RandomNumber },
      sqlite,
      timingSafeEqual: testTimingSafeEqual,
    })({ isOwnerWithinQuota: constTrue });
    await using run = testCreateRun();
    const [earlier, later] = [100, 200].map((millis): EncryptedCrdtMessage => ({
      timestamp: createTimestamp({ millis: millis as Millis }),
      change: new Uint8Array(3) as EncryptedDbChange,
    }));
    await run.orThrow(storage.writeMessages(testAppOwnerIdBytes, [later]));
    const readTables = () =>
      ["evolu_timestamp", "evolu_message", "evolu_usage"].map(
        (table) => sqlite.exec(sql`select * from ${sql.raw(table)};`).rows,
      );
    const tables = readTables();

    // The earlier timestamp's insert adds its row and then fails to update the
    // level 2 node after it.
    sqlite.exec(sql`
      create temp trigger evolu_timestamp_update_fails
      before update on evolu_timestamp
      begin
        select raise(abort, 'injected');
      end;
    `);
    const result = await run(
      storage.writeMessages(testAppOwnerIdBytes, [earlier]),
    );
    assertTrue(!result.ok && UnknownError.is(result.error));
    assertEqual(readTables(), tables);

    sqlite.exec(sql`drop trigger evolu_timestamp_update_fails;`);
    await run.orThrow(storage.writeMessages(testAppOwnerIdBytes, [earlier]));
    assertEqual(storage.getSize(testAppOwnerIdBytes), 2);
  });

  it("answers a write SQLite fails with WriteError and keeps serving", async () => {
    await using setup = await setupSqliteAndRelayStorage();
    const { sqlite, storage } = setup;
    await using run = testCreateRun({ storage });
    const request = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
      writeKey: testAppOwner.writeKey,
    });
    request.addMessage(createTestMessage(20_000));
    const requestMessage = request.unwrap();
    const respond = async () => {
      const { message } = await run.orThrow(
        applyProtocolMessageAsRelay(requestMessage),
      );
      return run(applyProtocolMessageAsClient(message));
    };
    // The owner's first write key is stored before the database is full.
    assertTrue(
      storage.validateWriteKey(testAppOwnerIdBytes, testAppOwner.writeKey),
    );
    const { pageCount } = sqlite.exec<{ pageCount: number }>(sql`
      select page_count as pageCount from pragma_page_count();
    `).rows[0];
    sqlite.exec(sql`pragma max_page_count = ${sql.raw(String(pageCount))};`);

    assertEqual(
      await respond(),
      err({ type: "ProtocolWriteError", ownerId: testAppOwner.id }),
    );
    assertEqual(storage.getSize(testAppOwnerIdBytes), 0);
    const logged = run.deps.console.getEntriesSnapshot();
    assertEqual(
      logged.map(({ method }) => method),
      ["error"],
    );
    assertTrue(UnknownError.is(logged[0]?.args[0]));

    sqlite.exec(sql`pragma max_page_count = 1000000;`);
    assertOk(await respond(), { type: "Readonly" });
    assertEqual(storage.getSize(testAppOwnerIdBytes), 1);
  });

  for (const failingQuery of ["split_timestamps", "from evolu_usage"]) {
    it(`answers a write whose ${failingQuery} read SQLite fails with WriteError and keeps serving`, async () => {
      await using setup = await setupSqlite();
      const { sqlite } = setup;
      createBaseSqliteStorageTables({ sqlite });
      createRelayStorageTables({ sqlite });
      let isFailing = true;
      const storage = createRelaySqliteStorage({
        ...setup.run.deps,
        sqlite: setupInterceptedSqlite(sqlite, (query, run) => {
          if (isFailing && query.sql.includes(failingQuery)) {
            isFailing = false;
            throw new Error("disk I/O error");
          }
          return run();
        }),
        timingSafeEqual: testTimingSafeEqual,
      })({ isOwnerWithinQuota: constTrue });
      await using run = testCreateRun({ storage });
      const request = createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Request,
        writeKey: testAppOwner.writeKey,
      });
      request.addMessage(createTestMessage(100));
      const requestMessage = request.unwrap();
      const respond = async () => {
        const { message } = await run.orThrow(
          applyProtocolMessageAsRelay(requestMessage),
        );
        return run(applyProtocolMessageAsClient(message));
      };

      assertEqual(
        await respond(),
        err({ type: "ProtocolWriteError", ownerId: testAppOwner.id }),
      );
      assertFalse(isFailing);
      assertEqual(storage.getSize(testAppOwnerIdBytes), 0);
      const logged = run.deps.console.getEntriesSnapshot();
      assertEqual(
        logged.map(({ method }) => method),
        ["error"],
      );
      assertTrue(UnknownError.is(logged[0]?.args[0]));

      assertOk(await respond(), { type: "Readonly" });
      assertEqual(storage.getSize(testAppOwnerIdBytes), 1);
    });
  }

  it("answers a new owner's write key SQLite fails to store with WriteError and keeps serving", async () => {
    await using setup = await setupSqlite();
    const { sqlite } = setup;
    createBaseSqliteStorageTables({ sqlite });
    createRelayStorageTables({ sqlite });
    const failure = new Error("database or disk is full");
    let isFailing = true;
    const storage = createRelaySqliteStorage({
      ...setup.run.deps,
      sqlite: setupInterceptedSqlite(sqlite, (query, run) => {
        if (isFailing && query.sql.includes("insert into evolu_writeKey")) {
          isFailing = false;
          throw failure;
        }
        return run();
      }),
      timingSafeEqual: testTimingSafeEqual,
    })({ isOwnerWithinQuota: constTrue });
    await using run = testCreateRun({ storage });
    const request = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
      writeKey: testAppOwner.writeKey,
    });
    request.addMessage(createTestMessage(100));
    const requestMessage = request.unwrap();
    const respond = async () => {
      const { message } = await run.orThrow(
        applyProtocolMessageAsRelay(requestMessage),
      );
      return run(applyProtocolMessageAsClient(message));
    };

    assertEqual(
      await respond(),
      err({ type: "ProtocolWriteError", ownerId: testAppOwner.id }),
    );
    assertFalse(isFailing);
    assertEqual(storage.getSize(testAppOwnerIdBytes), 0);
    const logged = run.deps.console.getEntriesSnapshot();
    assertEqual(
      logged.map(({ method }) => method),
      ["error"],
    );
    assertSame(logged[0]?.args[0], failure);

    assertOk(await respond(), { type: "Readonly" });
    assertEqual(storage.getSize(testAppOwnerIdBytes), 1);
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
