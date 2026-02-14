import { createRun, Name, testName } from "@evolu/common";
import { describe, expect, test } from "vitest";
import { leaderLock } from "../src/Platform.js";

describe("leaderLock", () => {
  test("acquire waits until previous lease is disposed", async () => {
    await using run = createRun();

    const first = await run(leaderLock.acquire(testName));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    let secondSettled = false;
    const second = run(leaderLock.acquire(testName));
    void second.then(() => {
      secondSettled = true;
    });

    await Promise.resolve();
    expect(secondSettled).toBe(false);

    first.value[Symbol.dispose]();

    const secondResult = await second;
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) return;

    secondResult.value[Symbol.dispose]();
  });

  test("different names acquire independently", async () => {
    await using run = createRun();

    const aName = Name.orThrow("LeaderLockA");
    const bName = Name.orThrow("LeaderLockB");

    const [a, b] = await Promise.all([
      run(leaderLock.acquire(aName)),
      run(leaderLock.acquire(bName)),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    if (a.ok) a.value[Symbol.dispose]();
    if (b.ok) b.value[Symbol.dispose]();
  });
});
