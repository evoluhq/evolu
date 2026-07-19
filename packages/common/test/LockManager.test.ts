import { describe, expect, test } from "vitest";
import { err, getOrThrow } from "../src/Result.ts";
import {
  acquireLeaderLock,
  acquireLeaderLockCallback,
  testCreateLockManager,
} from "../src/LockManager.ts";
import {
  createAbortError,
  createPanicAbortReason,
  runDisposedAbortReason,
  testCreateRun,
  yieldNow,
} from "../src/Task.ts";
import { Name } from "../src/Type.ts";

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
    const nativeLockManager = globalThis.navigator.locks;

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
});
