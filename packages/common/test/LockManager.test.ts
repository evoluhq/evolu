import { describe, expect, test } from "vitest";
import { err, getOrThrow } from "../src/Result.js";
import {
  acquireLeaderLock,
  testCreateLockManager,
} from "../src/LockManager.js";
import { runStoppedError, yieldNow } from "../src/Task.js";
import { testCreateRun, testWaitForMacrotask } from "../src/Test.js";
import { Name } from "../src/Type.js";

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

    const firstHeld = firstLockManager.request(name, async (lock) => {
      expect(lock).toEqual(expect.objectContaining({ name }));
      await releaseFirst.promise;
    });

    const firstPending = firstLockManager.request(name, () => undefined);

    const secondHeld = secondLockManager.request(name, async (lock) => {
      expect(lock).toEqual(expect.objectContaining({ name }));
      await releaseSecond.promise;
    });

    await testWaitForMacrotask();

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

    const first = await run.orThrow(acquireLeaderLock(leaderLockName));

    let secondSettled = false;
    const second = run(acquireLeaderLock(leaderLockName));
    void second.then(() => {
      secondSettled = true;
    });

    await run(yieldNow);
    expect(secondSettled).toBe(false);

    await first[Symbol.asyncDispose]();

    await using _secondLease = getOrThrow(await second);
  });

  test("different names acquire independently", async () => {
    await using run = testCreateRun({ lockManager: testCreateLockManager() });

    const [a, b] = await Promise.all([
      run.orThrow(acquireLeaderLock(leaderLockName)),
      run.orThrow(acquireLeaderLock(otherLeaderLockName)),
    ]);

    await a[Symbol.asyncDispose]();
    await b[Symbol.asyncDispose]();
  });

  test("root Run disposal releases lease-owned lock wait", async () => {
    const run = testCreateRun({ lockManager: testCreateLockManager() });

    await run.orThrow(acquireLeaderLock(leaderLockName));

    const disposePromise = run[Symbol.asyncDispose]();
    await testWaitForMacrotask();
    expect(run.getState().type).toBe("Settled");
    await disposePromise;
  });

  test("waiting caller aborts when root Run disposes", async () => {
    const run = testCreateRun({ lockManager: testCreateLockManager() });

    const first = await run.orThrow(acquireLeaderLock(leaderLockName));

    const second = run(acquireLeaderLock(leaderLockName));
    await run(yieldNow);

    const disposePromise = run[Symbol.asyncDispose]();
    await expect(second).resolves.toEqual(
      err({ type: "AbortError", reason: runStoppedError }),
    );
    await disposePromise;

    await first[Symbol.asyncDispose]();
  });

  test("aborting a waiting caller releases leadership", async () => {
    await using run = testCreateRun({ lockManager: testCreateLockManager() });

    const first = await run.orThrow(acquireLeaderLock(leaderLockName));

    const second = run(acquireLeaderLock(leaderLockName));
    await run(yieldNow);

    second.abort("stop");
    await expect(second).resolves.toEqual(
      err({ type: "AbortError", reason: "stop" }),
    );

    await first[Symbol.asyncDispose]();

    const third = await run.orThrow(acquireLeaderLock(leaderLockName));
    await third[Symbol.asyncDispose]();
  });

  test("maps non-abort lock manager failures to AbortError", async () => {
    const error = new Error("boom");
    await using run = testCreateRun({
      lockManager: {
        request: () => Promise.reject(error),
        query: () => Promise.resolve({ held: [], pending: [] }),
      },
    });

    await expect(run(acquireLeaderLock(leaderLockName))).resolves.toEqual(
      err({ type: "AbortError", reason: error }),
    );
  });

  test("works with native Node.js Web Locks", async () => {
    const nativeLockManager = globalThis.navigator.locks;

    await using run = testCreateRun({ lockManager: nativeLockManager });

    const first = await run(acquireLeaderLock(rawNativeLeaderLockName));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    let secondSettled = false;
    const second = run(acquireLeaderLock(rawNativeLeaderLockName));
    void second.then(() => {
      secondSettled = true;
    });

    await Promise.resolve();
    expect(secondSettled).toBe(false);

    await first.value[Symbol.asyncDispose]();

    const secondResult = await second;
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) return;

    await secondResult.value[Symbol.asyncDispose]();
  });
});
