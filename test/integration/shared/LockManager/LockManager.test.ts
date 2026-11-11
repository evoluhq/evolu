import { describe, expect, test } from "vitest";
import { err, getOrThrow } from "../../../../packages/common/src/Result.ts";
import { constVoid } from "../../../../packages/common/src/Function.ts";
import {
  acquireLeaderLock,
  acquireLeaderLockCallback,
  isLeaderLockHeld,
  testCreateLockManager,
} from "../../../../packages/common/src/LockManager.ts";
import {
  createAbortError,
  createPanicAbortReason,
  runDisposedAbortReason,
  testCreateRun,
  yieldNow,
} from "../../../../packages/common/src/Task.ts";
import { Name } from "../../../../packages/common/src/Type.ts";

/**
 * A lock manager that grants each request only when the test calls `grant`,
 * also after the request's abort, as Web Locks run the callback of a request
 * they granted just before its abort.
 */
const setupLateGrantLockManager = () => {
  const grants: Array<() => Promise<void>> = [];
  const lockManager: LockManager = {
    request: <T>(
      name: string,
      _options: LockOptions | LockGrantedCallback<T>,
      callback?: LockGrantedCallback<T>,
    ): Promise<Awaited<T>> => {
      const { promise, resolve } = Promise.withResolvers<Awaited<T>>();
      grants.push(async () => {
        resolve(await callback!({ mode: "exclusive", name }));
      });
      return promise;
    },
    query: () => Promise.resolve({ held: [], pending: [] }),
  };
  return {
    lockManager,
    /** Grants the oldest request, whose lock its callback then holds. */
    grant: (): { readonly isReleased: () => boolean } => {
      let released = false;
      void grants.shift()!().then(() => {
        released = true;
      });
      return { isReleased: () => released };
    },
  };
};

describe("testCreateLockManager", () => {
  test("isolates same visible names across wrappers", async () => {
    const firstLockManager = testCreateLockManager();
    const secondLockManager = testCreateLockManager();
    const name = "SharedVisibleName";
    const releaseFirst = Promise.withResolvers<void>();

    const firstRequest = firstLockManager.request(name, async (lock) => {
      expect(lock).toEqual(expect.objectContaining({ name }));
      await releaseFirst.promise;
      return "first";
    });

    let secondStarted = false;
    const secondRequest = secondLockManager.request(name, (lock) => {
      expect(lock).toEqual(expect.objectContaining({ name }));
      secondStarted = true;
      return "second";
    });

    await expect(secondRequest).resolves.toBe("second");
    expect(secondStarted).toBe(true);

    releaseFirst.resolve();
    await expect(firstRequest).resolves.toBe("first");
  });

  test("filters query results to the wrapper namespace", async () => {
    const firstLockManager = testCreateLockManager();
    const secondLockManager = testCreateLockManager();
    const name = "QueryVisibleName";
    const releaseFirst = Promise.withResolvers<void>();
    const releaseSecond = Promise.withResolvers<void>();
    const firstAcquired = Promise.withResolvers<void>();
    const secondAcquired = Promise.withResolvers<void>();

    const firstHeld = firstLockManager.request(name, async (lock) => {
      expect(lock).toEqual(expect.objectContaining({ name }));
      firstAcquired.resolve();
      await releaseFirst.promise;
    });

    const firstPending = firstLockManager.request(name, () => undefined);

    const secondHeld = secondLockManager.request(name, async (lock) => {
      expect(lock).toEqual(expect.objectContaining({ name }));
      secondAcquired.resolve();
      await releaseSecond.promise;
    });

    await Promise.all([firstAcquired.promise, secondAcquired.promise]);

    await expect(firstLockManager.query()).resolves.toEqual({
      held: [{ clientId: expect.any(String), mode: "exclusive", name }],
      pending: [{ clientId: expect.any(String), mode: "exclusive", name }],
    });

    await expect(secondLockManager.query()).resolves.toEqual({
      held: [{ clientId: expect.any(String), mode: "exclusive", name }],
      pending: [],
    });

    releaseFirst.resolve();
    releaseSecond.resolve();
    await firstHeld;
    await firstPending;
    await secondHeld;
  });

  test("rejects names starting with a hyphen", async () => {
    const lockManager = testCreateLockManager();

    await expect(
      lockManager.request("-reserved", () => "unreachable"),
    ).rejects.toMatchObject({ name: "NotSupportedError" });
  });
});

describe("acquireLeaderLock", () => {
  const leaderLockName = Name.orThrow("LeaderLock");
  const otherLeaderLockName = Name.orThrow("OtherLeaderLock");
  const rawNativeLeaderLockName = Name.orThrow("RawNativeLeaderLock");

  test("waits until previous lease is disposed", async () => {
    await using run = testCreateRun({ lockManager: testCreateLockManager() });

    const first = await run.ok(acquireLeaderLock(leaderLockName));

    let secondSettled = false;
    const second = run(acquireLeaderLock(leaderLockName));
    void second.then(() => {
      secondSettled = true;
    });

    await run.ok(yieldNow);
    expect(secondSettled).toBe(false);

    await first[Symbol.asyncDispose]();

    await using _secondLease = getOrThrow(await second);
  });

  test("different names acquire independently", async () => {
    await using run = testCreateRun({ lockManager: testCreateLockManager() });

    const [a, b] = await Promise.all([
      run.ok(acquireLeaderLock(leaderLockName)),
      run.ok(acquireLeaderLock(otherLeaderLockName)),
    ]);

    await a[Symbol.asyncDispose]();
    await b[Symbol.asyncDispose]();
  });

  test("root Run disposal releases lease-owned lock wait", async () => {
    const run = testCreateRun({ lockManager: testCreateLockManager() });

    await run.ok(acquireLeaderLock(leaderLockName));

    await run[Symbol.asyncDispose]();
    expect(run.getState().type).toBe("Settled");
  });

  test("waiting caller aborts when root Run disposes", async () => {
    const run = testCreateRun({ lockManager: testCreateLockManager() });

    const first = await run.ok(acquireLeaderLock(leaderLockName));

    const second = run.abortable(acquireLeaderLock(leaderLockName));
    await run.ok(yieldNow);

    const disposePromise = run[Symbol.asyncDispose]();
    await expect(second).resolves.toEqual(
      err(createAbortError(runDisposedAbortReason)),
    );
    await disposePromise;

    await first[Symbol.asyncDispose]();
  });

  test("aborting a waiting caller releases leadership", async () => {
    await using run = testCreateRun({ lockManager: testCreateLockManager() });

    const first = await run.ok(acquireLeaderLock(leaderLockName));

    const second = run.abortable(acquireLeaderLock(leaderLockName));
    await run.ok(yieldNow);

    const reason = { type: "TestAbortReason" };
    second.abort(reason);
    await expect(second).resolves.toEqual(err(createAbortError(reason)));

    await first[Symbol.asyncDispose]();

    const third = await run.ok(acquireLeaderLock(leaderLockName));
    await third[Symbol.asyncDispose]();
  });

  test("releases leadership the lock manager grants after the abort", async () => {
    const lateGrant = setupLateGrantLockManager();
    await using run = testCreateRun({ lockManager: lateGrant.lockManager });

    const waiting = run.abortable(acquireLeaderLock(leaderLockName));
    await run.ok(yieldNow);
    const reason = { type: "TestAbortReason" };
    waiting.abort(reason);
    const granted = lateGrant.grant();

    await expect(waiting).resolves.toEqual(err(createAbortError(reason)));
    await run.ok(yieldNow);
    expect(granted.isReleased()).toBe(true);
  });

  test("panics on non-abort lock manager failures", async () => {
    const error = new Error("boom");
    await using run = testCreateRun({
      lockManager: {
        request: () => Promise.reject(error),
        query: () => Promise.resolve({ held: [], pending: [] }),
      },
    });

    const reported = run.deps.reportDefect.next();

    await expect(
      run.abortable(acquireLeaderLock(leaderLockName)),
    ).resolves.toEqual(err(createAbortError(createPanicAbortReason(error))));
    await expect(reported).resolves.toEqual(
      createAbortError(createPanicAbortReason(error)),
    );
  });

  test("works with native Node.js Web Locks", async () => {
    const nativeLockManager = navigator.locks;

    await using run = testCreateRun({ lockManager: nativeLockManager });

    const first = await run.ok(acquireLeaderLock(rawNativeLeaderLockName));

    let secondSettled = false;
    const second = run(acquireLeaderLock(rawNativeLeaderLockName));
    void second.then(() => {
      secondSettled = true;
    });

    await Promise.resolve();
    expect(secondSettled).toBe(false);

    await first[Symbol.asyncDispose]();

    const secondResult = await second;
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) return;

    await secondResult.value[Symbol.asyncDispose]();
  });
});

describe("acquireLeaderLockCallback", () => {
  const leaderLockName = Name.orThrow("LeaderLockCallback");

  test("waits until previous disposable lease is disposed", async () => {
    const deps = { lockManager: testCreateLockManager() };
    const firstAcquired = Promise.withResolvers<void>();
    const secondAcquired = Promise.withResolvers<void>();
    const acquisitions: Array<string> = [];

    using first = acquireLeaderLockCallback(deps)(leaderLockName, () => {
      acquisitions.push("first");
      firstAcquired.resolve();
    });

    await firstAcquired.promise;

    let secondCallbackCalled = false;
    using _second = acquireLeaderLockCallback(deps)(leaderLockName, () => {
      acquisitions.push("second");
      secondCallbackCalled = true;
      secondAcquired.resolve();
    });

    expect(secondCallbackCalled).toBe(false);

    first[Symbol.dispose]();
    await secondAcquired.promise;

    expect(acquisitions).toEqual(["first", "second"]);
  });

  test("disposing pending acquisition prevents callback", async () => {
    const deps = { lockManager: testCreateLockManager() };
    const firstAcquired = Promise.withResolvers<void>();
    const thirdAcquired = Promise.withResolvers<void>();

    const first = acquireLeaderLockCallback(deps)(leaderLockName, () => {
      firstAcquired.resolve();
    });
    await firstAcquired.promise;

    let secondCallbackCalled = false;
    const second = acquireLeaderLockCallback(deps)(leaderLockName, () => {
      secondCallbackCalled = true;
    });

    second[Symbol.dispose]();
    first[Symbol.dispose]();

    using _third = acquireLeaderLockCallback(deps)(leaderLockName, () => {
      thirdAcquired.resolve();
    });

    await thirdAcquired.promise;
    expect(secondCallbackCalled).toBe(false);
  });

  test("releases leadership the lock manager grants after the disposal, without calling back", async () => {
    const lateGrant = setupLateGrantLockManager();
    await using run = testCreateRun();
    let calledBack = false;

    const waiting = acquireLeaderLockCallback(lateGrant)(leaderLockName, () => {
      calledBack = true;
    });
    waiting[Symbol.dispose]();
    const granted = lateGrant.grant();

    await run.ok(yieldNow);
    expect(calledBack).toBe(false);
    expect(granted.isReleased()).toBe(true);
  });
});

describe("isLeaderLockHeld", () => {
  const leaderLockName = Name.orThrow("HeldLeaderLock");

  test("tells whether a caller leads for the name", async () => {
    await using run = testCreateRun({ lockManager: testCreateLockManager() });
    const isHeld = isLeaderLockHeld(run.deps);
    expect(await isHeld(leaderLockName)).toBe(false);

    const lease = await run.ok(acquireLeaderLock(leaderLockName));
    expect(await isHeld(leaderLockName)).toBe(true);
    expect(await isHeld("OtherHeldLeaderLock")).toBe(false);

    await lease[Symbol.asyncDispose]();
    expect(await isHeld(leaderLockName)).toBe(false);
  });

  test("matches the whole name, as a database's gate extends the database's name", async () => {
    await using run = testCreateRun({ lockManager: testCreateLockManager() });
    const isHeld = isLeaderLockHeld(run.deps);
    const gateName = `${leaderLockName}-gate`;
    {
      // A DbWorker leads for its database while it checks its gate.
      await using _database = await run.ok(acquireLeaderLock(leaderLockName));
      expect(await isHeld(gateName)).toBe(false);
    }
    await using _gate = await run.ok(acquireLeaderLock(gateName));
    expect(await isHeld(leaderLockName)).toBe(false);
    expect(await isHeld(gateName)).toBe(true);
  });

  test("finds a caller that asked to lead for a free name right before", async () => {
    const deps = { lockManager: testCreateLockManager() };
    using _leader = acquireLeaderLockCallback(deps)(leaderLockName, constVoid);

    expect(await isLeaderLockHeld(deps)(leaderLockName)).toBe(true);
  });
});
