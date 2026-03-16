import { Name, testName } from "@evolu/common";
import { describe, expect, test } from "vitest";
import { createLeaderLock, createRun } from "../src/Task.js";

describe("leaderLock", () => {
  test("acquire waits until previous lease is disposed", async () => {
    await using run = createRun();
    const leaderLock = createLeaderLock();

    const first = await run(leaderLock.lock(testName));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    let secondSettled = false;
    const second = run(leaderLock.lock(testName));
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

  test("different names acquire independently", async () => {
    await using run = createRun();
    const leaderLock = createLeaderLock();

    const aName = Name.orThrow("LeaderLockA");
    const bName = Name.orThrow("LeaderLockB");

    const [a, b] = await Promise.all([
      run(leaderLock.lock(aName)),
      run(leaderLock.lock(bName)),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    if (a.ok) await a.value[Symbol.asyncDispose]();
    if (b.ok) await b.value[Symbol.asyncDispose]();
  });
});
