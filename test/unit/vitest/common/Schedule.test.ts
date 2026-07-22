import { describe, expect, test } from "vitest";
import type { RandomNumber } from "../../../../packages/common/src/Random.ts";
import type { NextResult } from "../../../../packages/common/src/Result.ts";
import { done, err, ok } from "../../../../packages/common/src/Result.ts";
import type { Schedule } from "../../../../packages/common/src/Schedule.ts";
import {
  addDelay,
  always,
  collectAllScheduleOutputs,
  collectScheduleInputs,
  collectUntilScheduleOutput,
  collectWhileScheduleOutput,
  compensate,
  delayed,
  delays,
  during,
  elapsed,
  exponential,
  fibonacci,
  fixed,
  foldSchedule,
  forever,
  fromDelay,
  fromDelays,
  intersectSchedules,
  jitter,
  linear,
  mapSchedule,
  maxDelay,
  maxElapsed,
  modifyDelay,
  once,
  passthrough,
  recurs,
  repetitions,
  resetScheduleAfter,
  retryStrategyAws,
  sequenceSchedules,
  spaced,
  take,
  tapScheduleInput,
  tapScheduleOutput,
  unfoldSchedule,
  unionSchedules,
  untilScheduleInput,
  untilScheduleOutput,
  whenInput,
  whileScheduleInput,
  whileScheduleOutput,
  windowed,
} from "../../../../packages/common/src/Schedule.ts";
import { testCreateDeps } from "../../../../packages/common/src/Task.ts";
import {
  maxMillis,
  Millis,
  minMillis,
  PositiveMillis,
  testCreateTime,
} from "../../../../packages/common/src/Time.ts";
import {
  type DateIso,
  NonNegativeInt,
  Ratio,
} from "../../../../packages/common/src/Type.ts";

// Helper to create scheduleDeps with controllable time
const createScheduleDeps = (startAt = 0) => {
  const deps = testCreateDeps();
  const time = testCreateTime({ startAt: Millis.orThrow(startAt) });
  return { ...deps, time };
};

const createScheduleDepsWithNow = (...times: ReadonlyArray<number>) => {
  const deps = testCreateDeps();
  let index = 0;
  const time = testCreateTime({ startAt: Millis.orThrow(times[0] ?? 0) });
  function now(): Millis;
  function now(type: "DateIso"): DateIso;
  function now(type?: "DateIso"): Millis | DateIso {
    if (type === "DateIso") return time.now(type);
    return Millis.orThrow(times[Math.min(index++, times.length - 1)]);
  }
  return {
    ...deps,
    time: {
      ...time,
      now,
    },
  };
};

const createScheduleDepsWithRandom = (value: RandomNumber) => ({
  ...createScheduleDeps(),
  random: { next: () => value },
});

const expectOk = (
  result: NextResult<readonly [unknown, Millis]>,
  [output, delay]: readonly [unknown, number],
): void => {
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value[0]).toStrictEqual(output);
  expect(result.value[1]).toStrictEqual(Millis.orThrow(delay));
};

const expectDone = (result: NextResult<readonly [unknown, Millis]>): void => {
  expect(result).toStrictEqual(err(done()));
};

describe("Schedule", () => {
  test("Output is covariant (out)", () => {
    const deps = createScheduleDeps();
    // Substitutability by output: a schedule producing more info can be used where
    // less info is required.
    interface RetryInfo {
      readonly attempt: number;
      readonly delay: Millis;
    }

    // Create a schedule that outputs detailed info
    const detailedSchedule: Schedule<RetryInfo> = () => {
      let attempt = 0;
      return () => {
        attempt++;
        const delay = Millis.orThrow(100 * attempt);
        return ok([{ attempt, delay }, delay]);
      };
    };

    // Create a schedule that outputs less detailed info
    const lessDetailedSchedule: Schedule<{ readonly attempt: number }> = () => {
      let attempt = 0;
      return () => {
        attempt++;
        const delay = Millis.orThrow(100 * attempt);
        return ok([{ attempt }, delay]);
      };
    };

    // ✓ Allowed: detailed output → less detailed output
    const useSchedule = (s: Schedule<{ readonly attempt: number }>) => {
      const step = s(deps);
      return step(undefined);
    };
    const result = useSchedule(detailedSchedule);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value[0].attempt : null).toBe(1);

    // ✗ Not assignable in the other direction (output is missing fields).
    // This is a structural type error; that's the expected mechanism.
    // @ts-expect-error - Output lacks "delay"
    const _invalid: Schedule<RetryInfo> = lessDetailedSchedule;
  });

  test("Input is contravariant (in)", () => {
    const deps = createScheduleDeps();
    // Substitutability by input: a schedule that accepts broader inputs can be
    // used where narrower inputs are provided.
    interface HttpError {
      readonly status: number;
      readonly message: string;
    }

    interface RateLimitError extends HttpError {
      readonly retryAfter: number;
    }

    // spaced("1s") accepts unknown input - it doesn't inspect input at all
    const genericSchedule: Schedule<Millis> = spaced("1s");

    // ✓ Allowed: broader input → narrower input
    const retryWithSchedule = (
      error: RateLimitError,
      schedule: Schedule<Millis, RateLimitError>,
    ) => {
      const step = schedule(deps);
      return step(error);
    };

    const error: RateLimitError = {
      status: 429,
      message: "Too many",
      retryAfter: 60,
    };
    const result = retryWithSchedule(error, genericSchedule);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value[1] : null).toBe(1000);

    // ✗ Not assignable in the other direction (schedule expects RateLimitError).
    const specificSchedule: Schedule<Millis, RateLimitError> = whenInput<
      RateLimitError,
      Millis
    >(
      (e) => e.retryAfter > 0,
      spaced("5s"),
    )(spaced("1s"));
    // @ts-expect-error - Input is too narrow
    const _invalid: Schedule<Millis, HttpError> = specificSchedule;
  });
});

describe("forever", () => {
  test("returns attempt count and 0 delay", () => {
    const deps = createScheduleDeps();
    const step = forever(deps);
    expectOk(step(undefined), [0, 0]);
    expectOk(step(undefined), [1, 0]);
    expectOk(step(undefined), [2, 0]);
  });
});

describe("once", () => {
  test("runs exactly once", () => {
    const deps = createScheduleDeps();
    const step = once(deps);
    expectOk(step(undefined), [0, 0]);
    expectDone(step(undefined));
  });
});

describe("recurs", () => {
  test("limits repetitions", () => {
    const deps = createScheduleDeps();
    const step = recurs(3)(deps);
    expectOk(step(undefined), [0, 0]);
    expectOk(step(undefined), [1, 0]);
    expectOk(step(undefined), [2, 0]);
    expectDone(step(undefined));
  });
});

describe("spaced", () => {
  test("returns constant delay", () => {
    const deps = createScheduleDeps();
    const step = spaced("100ms")(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [100, 100]);
  });
});

describe("exponential", () => {
  test("grows by factor", () => {
    const deps = createScheduleDeps();
    const step = exponential("100ms")(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [400, 400]);
    expectOk(step(undefined), [800, 800]);
  });

  test("with custom factor", () => {
    const deps = createScheduleDeps();
    const step = exponential("100ms", 3)(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [300, 300]);
    expectOk(step(undefined), [900, 900]);
  });

  test("with fractional factor rounds to millis", () => {
    const deps = createScheduleDeps();
    const step = exponential("100ms", 1.5)(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [150, 150]);
    expectOk(step(undefined), [225, 225]);
    expectOk(step(undefined), [338, 338]);
  });

  test("states are independent (stateful)", () => {
    const deps = createScheduleDeps();
    const schedule = exponential("100ms");

    const step1 = schedule(deps);
    const step2 = schedule(deps);

    // Each step has its own data
    expectOk(step1(undefined), [100, 100]);
    expectOk(step1(undefined), [200, 200]);

    // step2 starts fresh
    expectOk(step2(undefined), [100, 100]);
    expectOk(step2(undefined), [200, 200]);

    // step1 continues from its data
    expectOk(step1(undefined), [400, 400]);
  });

  test("saturates at maxMillis instead of throwing on overflow", () => {
    const deps = createScheduleDeps();
    const step = exponential("100ms")(deps);
    // Advance to attempt 43 where 100 * 2^42 > maxMillis
    for (let i = 0; i < 42; i++) step(undefined);
    expect(step(undefined)).toEqual(ok([maxMillis, maxMillis]));
    expect(step(undefined)).toEqual(ok([maxMillis, maxMillis]));
  });

  test("keeps a zero base at zero after the power overflows", () => {
    const step = exponential(minMillis)(createScheduleDeps());
    for (let i = 0; i < 1025; i++) step(undefined);
    expect(step(undefined)).toEqual(ok([minMillis, minMillis]));
  });

  test("throws for invalid factor", () => {
    expect(() => exponential("100ms", Number.NaN)).toThrow("Expected Brand.");
    expect(() => exponential("100ms", Number.POSITIVE_INFINITY)).toThrow(
      "Expected Brand.",
    );
    expect(() => exponential("100ms", -1)).toThrow("Expected Brand.");
  });
});

describe("linear", () => {
  test("grows linearly", () => {
    const deps = createScheduleDeps();
    const step = linear("100ms")(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [300, 300]);
    expectOk(step(undefined), [400, 400]);
  });

  test("saturates at maxMillis instead of throwing on overflow", () => {
    const deps = createScheduleDeps();
    const step = linear(maxMillis)(deps);
    expect(step(undefined)).toEqual(ok([maxMillis, maxMillis]));
    expect(step(undefined)).toEqual(ok([maxMillis, maxMillis]));
  });
});

describe("fibonacci", () => {
  test("grows by fibonacci sequence", () => {
    const deps = createScheduleDeps();
    const step = fibonacci("100ms")(deps);
    // F(1)=1, F(2)=1, F(3)=2, F(4)=3, F(5)=5, F(6)=8
    expectOk(step(undefined), [100, 100]); // 100 * 1
    expectOk(step(undefined), [100, 100]); // 100 * 1
    expectOk(step(undefined), [200, 200]); // 100 * 2
    expectOk(step(undefined), [300, 300]); // 100 * 3
    expectOk(step(undefined), [500, 500]); // 100 * 5
    expectOk(step(undefined), [800, 800]); // 100 * 8
  });

  test("saturates at maxMillis instead of throwing after max Fibonacci index", () => {
    const deps = createScheduleDeps();
    const step = fibonacci("1ms")(deps);
    for (let i = 0; i < 78; i++) step(undefined);
    expect(step(undefined)).toEqual(ok([maxMillis, maxMillis]));
    expect(step(undefined)).toEqual(ok([maxMillis, maxMillis]));
  });
});

describe("fixed", () => {
  test("aligns to window boundaries", () => {
    const deps = createScheduleDeps();
    const step = fixed("10s")(deps);

    // First execution at T=0, outputs count 0, wait 10s to align to first window
    expectOk(step(undefined), [0, 10000]);

    // Second at T=13 (3s into second window), outputs count 1
    // Next window boundary is at T=20, so wait 7s
    deps.time.advance("13s");
    expectOk(step(undefined), [1, 7000]);

    // Third at T=27 (7s into third window), outputs count 2
    // Next window boundary is at T=30, so wait 3s
    deps.time.advance("14s"); // now at 27s
    expectOk(step(undefined), [2, 3000]);

    // Fourth at T=35 (5s into fourth window), outputs count 3
    // Next window boundary is at T=40, so wait 5s
    deps.time.advance("8s"); // now at 35s
    expectOk(step(undefined), [3, 5000]);
  });

  test("handles running behind (execution > interval)", () => {
    const deps = createScheduleDeps();
    const step = fixed("10s")(deps);

    // First execution starts
    expectOk(step(undefined), [0, 10000]);

    // Execution took 25s, now at T=25 (should have run at T=10, T=20)
    // Running behind: delay is 0, but next boundary is T=30
    deps.time.advance("25s");
    expectOk(step(undefined), [1, 0]);

    // Now at T=28, not running behind anymore, align to T=30
    deps.time.advance("3s");
    expectOk(step(undefined), [2, 2000]);
  });

  test("catches up missed recurrences before realigning", () => {
    const deps = createScheduleDeps();
    const step = fixed("10s")(deps);

    expectOk(step(undefined), [0, 10000]);
    deps.time.advance("55s");
    expectOk(step(undefined), [1, 0]);
    expectOk(step(undefined), [2, 0]);
    expectOk(step(undefined), [3, 0]);
    expectOk(step(undefined), [4, 0]);
    expectOk(step(undefined), [5, 5000]);
  });

  test("with zero interval", () => {
    const deps = createScheduleDeps();
    const step = fixed(minMillis)(deps);
    expectOk(step(undefined), [0, 0]);
    deps.time.advance("100ms");
    expectOk(step(undefined), [1, 0]);
    deps.time.advance("100ms");
    expectOk(step(undefined), [2, 0]);
  });
});

describe("windowed", () => {
  test("skips missed recurrences before realigning", () => {
    const deps = createScheduleDeps();
    const step = windowed("10s")(deps);

    expectOk(step(undefined), [0, 10000]);
    deps.time.advance("55s");
    expectOk(step(undefined), [1, 5000]);
  });

  test("waits until the next interval at an exact boundary", () => {
    const deps = createScheduleDeps();
    const step = windowed("100ms")(deps);

    expectOk(step(undefined), [0, 100]);
    deps.time.advance("100ms");
    expectOk(step(undefined), [1, 100]);
  });

  test("with zero interval", () => {
    const deps = createScheduleDeps();
    const step = windowed(minMillis)(deps);
    expectOk(step(undefined), [0, 0]);
    deps.time.advance("100ms");
    expectOk(step(undefined), [1, 0]);
    deps.time.advance("100ms");
    expectOk(step(undefined), [2, 0]);
  });

  test("aligns to window boundaries", () => {
    const schedule = windowed("100ms");
    const deps = createScheduleDeps();

    // At elapsed=0, wait full 100ms to next boundary
    const step = schedule(deps);
    expectOk(step(undefined), [0, 100]);
    // At elapsed=30, wait 70ms to next boundary
    deps.time.advance("30ms");
    expectOk(step(undefined), [1, 70]);
    // At elapsed=150 (30 + 120 more), wait 50ms to next boundary (200ms)
    deps.time.advance("120ms");
    expectOk(step(undefined), [2, 50]);
  });
});

describe("fromDelay", () => {
  test("creates single-delay schedule", () => {
    const deps = createScheduleDeps();
    const schedule = fromDelay("500ms");
    const step = schedule(deps);

    expectOk(step(undefined), [500, 500]);
    expectDone(step(undefined));
  });
});

describe("fromDelays", () => {
  test("creates sequence of delays", () => {
    const deps = createScheduleDeps();
    const schedule = fromDelays("100ms", "500ms", "2s");
    const step = schedule(deps);

    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [500, 500]);
    expectOk(step(undefined), [2000, 2000]);
    expectDone(step(undefined));
  });

  test("stops immediately with no delays", () => {
    const step = fromDelays()(createScheduleDeps());

    expectDone(step(undefined));
  });
});

describe("elapsed", () => {
  test("outputs total elapsed time", () => {
    const deps = createScheduleDeps();
    const step = elapsed(deps);

    expectOk(step(undefined), [0, 0]);
    deps.time.advance("100ms");
    expectOk(step(undefined), [100, 0]);
    deps.time.advance("400ms");
    expectOk(step(undefined), [500, 0]);
    deps.time.advance("500ms");
    expectOk(step(undefined), [1000, 0]);
  });

  test("returns zero elapsed time when time moves backwards", () => {
    const deps = createScheduleDepsWithNow(100, 50);
    const step = elapsed(deps);

    expectOk(step(undefined), [0, 0]);
    expectOk(step(undefined), [0, 0]);
  });

  test("combined with other schedule", () => {
    const deps = createScheduleDeps();
    const step = intersectSchedules(take(3)(spaced("100ms")), elapsed)(deps);

    const result1 = step(undefined);
    expect(result1.ok).toBe(true);
    expect(result1.ok ? result1.value[0][0] : null).toBe(100); // spaced output
    expect(result1.ok ? result1.value[0][1] : null).toBe(0); // elapsed output
    expect(result1.ok ? result1.value[1] : null).toBe(100); // max delay

    deps.time.advance("150ms");
    const result2 = step(undefined);
    expect(result2.ok).toBe(true);
    expect(result2.ok ? result2.value[0][0] : null).toBe(100);
    expect(result2.ok ? result2.value[0][1] : null).toBe(150);

    deps.time.advance("150ms");
    const result3 = step(undefined);
    expect(result3.ok).toBe(true);
    expect(result3.ok ? result3.value[0][0] : null).toBe(100);
    expect(result3.ok ? result3.value[0][1] : null).toBe(300);

    deps.time.advance("100ms");
    expectDone(step(undefined)); // take(3) exhausted
  });
});

describe("during", () => {
  test("runs for specified duration then stops", () => {
    const schedule = during("100ms");
    const deps = createScheduleDeps();
    const step = schedule(deps);

    expectOk(step(undefined), [0, 0]);
    deps.time.advance("50ms");
    expectOk(step(undefined), [50, 0]);
    deps.time.advance("50ms");
    expectOk(step(undefined), [100, 0]); // exactly at limit
    deps.time.advance("1ms");
    expectDone(step(undefined)); // over limit
  });
});

describe("always", () => {
  test("always outputs constant value", () => {
    const deps = createScheduleDeps();
    const step = take(3)(always("retry"))(deps);
    expectOk(step(undefined), ["retry", 0]);
    expectOk(step(undefined), ["retry", 0]);
    expectOk(step(undefined), ["retry", 0]);
    expectDone(step(undefined));
  });
});

describe("unfoldSchedule", () => {
  test("creates schedule from state function", () => {
    const deps = createScheduleDeps();
    // Simple counter
    const step = take(4)(unfoldSchedule(0, (n) => n + 1))(deps);

    expectOk(step(undefined), [0, 0]);
    expectOk(step(undefined), [1, 0]);
    expectOk(step(undefined), [2, 0]);
    expectOk(step(undefined), [3, 0]);
    expectDone(step(undefined));
  });

  test("with custom state transformation", () => {
    const deps = createScheduleDeps();
    // Multiply by 2 each time
    const step = take(4)(unfoldSchedule(1, (n) => n * 2))(deps);

    expectOk(step(undefined), [1, 0]);
    expectOk(step(undefined), [2, 0]);
    expectOk(step(undefined), [4, 0]);
    expectOk(step(undefined), [8, 0]);
  });

  test("with object state", () => {
    const deps = createScheduleDeps();
    interface Phase {
      readonly name: string;
      readonly count: number;
    }

    const nextPhase = (phase: Phase): Phase => ({
      name: phase.count < 2 ? "warmup" : "active",
      count: phase.count + 1,
    });

    const step = take(4)(unfoldSchedule({ name: "init", count: 0 }, nextPhase))(
      deps,
    );

    expectOk(step(undefined), [{ name: "init", count: 0 }, 0]);
    expectOk(step(undefined), [{ name: "warmup", count: 1 }, 0]);
    expectOk(step(undefined), [{ name: "warmup", count: 2 }, 0]);
    expectOk(step(undefined), [{ name: "active", count: 3 }, 0]);
  });
});

describe("take", () => {
  test("limits attempts", () => {
    const deps = createScheduleDeps();
    const step = take(3)(exponential("100ms"))(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [400, 400]);
    expectDone(step(undefined));
  });

  test("accepts literals from 0 to 100 or a validated NonNegativeInt", () => {
    take(0);
    take(100);
    take(NonNegativeInt.orThrow(101));
  });

  test("requires validation for other numbers", () => {
    // @ts-expect-error - Dynamic numbers require validation.
    take(Math.random());
    // @ts-expect-error - Literals above 100 require validation.
    take(101);
    // @ts-expect-error - Negative integers are invalid.
    take(-1);
    // @ts-expect-error - Fractions are invalid.
    take(1.5);
  });
});

describe("maxElapsed", () => {
  test("stops after duration", () => {
    const deps = createScheduleDeps();
    const step = maxElapsed("250ms")(exponential("100ms"))(deps);
    expectOk(step(undefined), [100, 100]);
    deps.time.advance("100ms");
    expectOk(step(undefined), [200, 200]);
    deps.time.advance("150ms"); // now at 250ms
    expectDone(step(undefined)); // elapsed >= 250
  });

  test("keeps terminal done when time moves backwards", () => {
    const step = maxElapsed("250ms")(exponential("100ms"))(
      createScheduleDepsWithNow(0, 250, 0),
    );

    expectOk(step(undefined), [100, 100]);
    expectDone(step(undefined));
    expectDone(step(undefined));
  });
});

describe("maxDelay", () => {
  test("caps delay", () => {
    const deps = createScheduleDeps();
    const step = maxDelay("300ms")(exponential("100ms"))(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [400, 300]); // capped
    expectOk(step(undefined), [800, 300]); // capped
  });

  test("maxDelay preserves done", () => {
    const deps = createScheduleDeps();
    const step = maxDelay("300ms")(once)(deps);
    expectOk(step(undefined), [0, 0]);
    expectDone(step(undefined));
  });
});

describe("jitter", () => {
  test("0% preserves delay", () => {
    const deps = createScheduleDeps();
    const step = jitter("0%")(spaced("100ms"))(deps);

    expectOk(step(undefined), [100, 100]);
  });

  test("accepts Ratio", () => {
    expect(() => jitter(Ratio.orThrow(1))).not.toThrow();
  });

  describe("below", () => {
    test("defaults to 50% below jitter", () => {
      const result = jitter()(spaced("100ms"))(
        createScheduleDepsWithRandom(0.5 as RandomNumber),
      )(undefined);
      const explicitResult = jitter("50%", "below")(spaced("100ms"))(
        createScheduleDepsWithRandom(0.5 as RandomNumber),
      )(undefined);

      expect(result).toEqual(explicitResult);
      expectOk(result, [100, 75]);
    });

    test("50% applies equal jitter", () => {
      expectOk(
        jitter("50%")(spaced("100ms"))(
          createScheduleDepsWithRandom(0 as RandomNumber),
        )(undefined),
        [100, 50],
      );
      expectOk(
        jitter("50%", "below")(spaced("100ms"))(
          createScheduleDepsWithRandom(0.5 as RandomNumber),
        )(undefined),
        [100, 75],
      );
      expectOk(
        jitter("50%")(spaced("100ms"))(
          createScheduleDepsWithRandom(0.999999999 as RandomNumber),
        )(undefined),
        [100, 100],
      );
    });

    test("100% applies full jitter", () => {
      expectOk(
        jitter("100%")(spaced("100ms"))(
          createScheduleDepsWithRandom(0 as RandomNumber),
        )(undefined),
        [100, 0],
      );
      expectOk(
        jitter("100%")(spaced("100ms"))(
          createScheduleDepsWithRandom(0.5 as RandomNumber),
        )(undefined),
        [100, 50],
      );
      expectOk(
        jitter("100%")(spaced("100ms"))(
          createScheduleDepsWithRandom(0.999999999 as RandomNumber),
        )(undefined),
        [100, 100],
      );
    });
  });

  describe("around", () => {
    test("randomizes around the original delay", () => {
      expectOk(
        jitter("50%", "around")(spaced("100ms"))(
          createScheduleDepsWithRandom(0 as RandomNumber),
        )(undefined),
        [100, 50],
      );
      expectOk(
        jitter("50%", "around")(spaced("100ms"))(
          createScheduleDepsWithRandom(0.5 as RandomNumber),
        )(undefined),
        [100, 100],
      );
      expectOk(
        jitter("50%", "around")(spaced("100ms"))(
          createScheduleDepsWithRandom(0.999999999 as RandomNumber),
        )(undefined),
        [100, 150],
      );
    });

    test("saturates at maxMillis instead of throwing on overflow", () => {
      const step = jitter("100%", "around")(spaced(maxMillis))(
        createScheduleDepsWithRandom(0.999999999 as RandomNumber),
      );
      expect(step(undefined)).toEqual(ok([maxMillis, maxMillis]));
    });
  });

  test("jitter preserves done", () => {
    const deps = createScheduleDeps();
    const step = jitter("50%")(once)(deps);
    expectOk(step(undefined), [0, 0]);
    expectDone(step(undefined));
  });
});

describe("delayed", () => {
  test("replaces the first delay", () => {
    const deps = createScheduleDeps();
    const step = delayed("500ms")(exponential("100ms"))(deps);
    expectOk(step(undefined), [100, 500]); // Initial delay
    expectOk(step(undefined), [200, 200]); // Normal delays
    expectOk(step(undefined), [400, 400]);
  });

  test("does not override termination", () => {
    const deps = createScheduleDeps();
    const step = delayed("500ms")(take(0)(forever))(deps);
    expectDone(step(undefined));
  });
});

describe("addDelay", () => {
  test("adds fixed delay to schedule", () => {
    const deps = createScheduleDeps();
    const schedule = addDelay("500ms")(exponential("100ms"));
    const step = schedule(deps);

    const result1 = step(undefined);
    expect(result1.ok).toBe(true);
    expect(result1.ok ? result1.value[1] : null).toBe(600); // 100 + 500

    const result2 = step(undefined);
    expect(result2.ok).toBe(true);
    expect(result2.ok ? result2.value[1] : null).toBe(700); // 200 + 500

    const result3 = step(undefined);
    expect(result3.ok).toBe(true);
    expect(result3.ok ? result3.value[1] : null).toBe(900); // 400 + 500
  });
});

describe("modifyDelay", () => {
  test("transforms delays", () => {
    const deps = createScheduleDeps();
    // Double all delays
    const step = modifyDelay((d) => d * 2)(exponential("100ms"))(deps);
    expectOk(step(undefined), [100, 200]);
    expectOk(step(undefined), [200, 400]);
    expectOk(step(undefined), [400, 800]);
  });

  test("passes through termination", () => {
    const deps = createScheduleDeps();
    const step = modifyDelay(() => 123)(take(1)(forever))(deps);
    expectOk(step(undefined), [0, 123]);
    expectDone(step(undefined));
  });

  test("saturates at maxMillis instead of throwing on overflow", () => {
    const deps = createScheduleDeps();
    const step = modifyDelay(() => maxMillis + 1)(once)(deps);
    expect(step(undefined)).toEqual(ok([0, maxMillis]));
  });

  test("throws when the transform returns NaN", () => {
    const step = modifyDelay(() => Number.NaN)(once)(createScheduleDeps());
    expect(() => step(undefined)).toThrow("Expected Brand.");
  });
});

describe("compensate", () => {
  test("subtracts execution time, not previous sleep", () => {
    const deps = createScheduleDeps();
    const step = compensate(spaced("1s"))(deps);

    expectOk(step(undefined), [1000, 1000]);

    // Simulate: slept 1000ms, then execution took 200ms.
    deps.time.advance("1.2s");
    expectOk(step(undefined), [1000, 800]);
  });

  test("keeps full delay until previous delay elapses", () => {
    const deps = createScheduleDeps();
    const step = compensate(spaced("1s"))(deps);
    // First attempt at T=0, no previous → full delay
    expectOk(step(undefined), [1000, 1000]);
    // Second at T=200, before the previous 1000ms delay could have elapsed
    deps.time.advance("200ms");
    expectOk(step(undefined), [1000, 1000]);
  });

  test("passes through termination", () => {
    const deps = createScheduleDeps();
    const step = compensate(take(1)(spaced("1s")))(deps);
    expectOk(step(undefined), [1000, 1000]);
    expectDone(step(undefined));
  });

  test("keeps full delay when time moves backwards", () => {
    const deps = createScheduleDepsWithNow(100, 50);
    const step = compensate(spaced("1s"))(deps);

    expectOk(step(undefined), [1000, 1000]);
    expectOk(step(undefined), [1000, 1000]);
  });
});

describe("whileScheduleInput", () => {
  test("continues while predicate is true", () => {
    const deps = createScheduleDeps();
    interface Error {
      readonly type: "Transient" | "Fatal";
    }
    const schedule = whileScheduleInput<Error>((e) => e.type === "Transient")(
      spaced("100ms"),
    );
    const step = schedule(deps);

    expectOk(step({ type: "Transient" }), [100, 100]);
    expectOk(step({ type: "Transient" }), [100, 100]);
    expectDone(step({ type: "Fatal" }));
  });

  test("remains done after predicate fails", () => {
    const deps = createScheduleDeps();
    const step = whileScheduleInput((n: number) => n > 0)(forever)(deps);

    expectOk(step(1), [0, 0]);
    expectDone(step(0));
    expectDone(step(1));
  });
});

describe("untilScheduleInput", () => {
  test("stops when predicate becomes true", () => {
    const deps = createScheduleDeps();

    interface Error {
      readonly type: "Transient" | "Fatal";
    }
    const schedule = untilScheduleInput<Error>((e) => e.type === "Fatal")(
      spaced("100ms"),
    );
    const step = schedule(deps);

    expectOk(step({ type: "Transient" }), [100, 100]);
    expectOk(step({ type: "Transient" }), [100, 100]);
    expectDone(step({ type: "Fatal" }));
  });
});

describe("whileScheduleOutput", () => {
  test("continues while predicate is true", () => {
    const deps = createScheduleDeps();
    // Stop when delay exceeds 300ms
    const step = whileScheduleOutput((delay: Millis) => delay <= 300)(
      exponential("100ms"),
    )(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectDone(step(undefined)); // 400 > 300
  });

  test("passes through termination", () => {
    const deps = createScheduleDeps();
    const step = whileScheduleOutput(() => true)(take(1)(forever))(deps);
    expectOk(step(undefined), [0, 0]);
    expectDone(step(undefined));
  });
});

describe("untilScheduleOutput", () => {
  test("stops when predicate becomes true", () => {
    const deps = createScheduleDeps();
    // Stop when delay reaches 400ms
    const step = untilScheduleOutput((delay: Millis) => delay >= 400)(
      exponential("100ms"),
    )(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectDone(step(undefined)); // 400 >= 400
  });

  test("passes through termination", () => {
    const deps = createScheduleDeps();
    const step = untilScheduleOutput(() => false)(take(1)(forever))(deps);
    expectOk(step(undefined), [0, 0]);
    expectDone(step(undefined));
  });
});

describe("predicate filters", () => {
  test("other predicate stops are sticky", () => {
    const inputUntilStep = untilScheduleInput((n: number) => n <= 0)(forever)(
      createScheduleDeps(),
    );
    expectOk(inputUntilStep(1), [0, 0]);
    expectDone(inputUntilStep(0));
    expectDone(inputUntilStep(1));

    const outputWhileStep = whileScheduleOutput((n: number) => n > 0)(
      unfoldSchedule(1, (n) => (n === 1 ? 0 : 1)),
    )(createScheduleDeps());
    expectOk(outputWhileStep(undefined), [1, 0]);
    expectDone(outputWhileStep(undefined));
    expectDone(outputWhileStep(undefined));

    const outputUntilStep = untilScheduleOutput((n: number) => n <= 0)(
      unfoldSchedule(1, (n) => (n === 1 ? 0 : 1)),
    )(createScheduleDeps());
    expectOk(outputUntilStep(undefined), [1, 0]);
    expectDone(outputUntilStep(undefined));
    expectDone(outputUntilStep(undefined));
  });
});

describe("resetScheduleAfter", () => {
  test("requires a positive millis duration", () => {
    resetScheduleAfter("1ms");
    resetScheduleAfter(PositiveMillis.orThrow(1));
    // @ts-expect-error - Zero Millis is not a positive duration.
    resetScheduleAfter(minMillis);
  });

  test("resets a running schedule after inactivity", () => {
    const deps = createScheduleDeps();
    const step = resetScheduleAfter("1s")(exponential("100ms"))(deps);

    expectOk(step(undefined), [100, 100]);
    deps.time.advance("100ms");
    expectOk(step(undefined), [200, 200]);
    deps.time.advance("1s");
    expectOk(step(undefined), [100, 100]);
    deps.time.advance("100ms");
    expectOk(step(undefined), [200, 200]);
  });

  test("keeps terminal done after inactivity", () => {
    const deps = createScheduleDeps();
    const step = resetScheduleAfter("1s")(take(1)(spaced("100ms")))(deps);

    expectOk(step(undefined), [100, 100]);
    expectDone(step(undefined));
    deps.time.advance("2s");
    expectDone(step(undefined));
  });
});

describe("mapSchedule", () => {
  test("transforms output", () => {
    const deps = createScheduleDeps();
    const schedule = mapSchedule((delay: Millis) => ({
      delay,
      doubled: delay * 2,
    }))(exponential("100ms"));
    const step = schedule(deps);

    const result1 = step(undefined);
    expect(result1.ok).toBe(true);
    expect(result1.ok ? result1.value[0] : null).toEqual({
      delay: 100,
      doubled: 200,
    });
    expect(result1.ok ? result1.value[1] : null).toBe(100); // delay unchanged

    const result2 = step(undefined);
    expect(result2.ok).toBe(true);
    expect(result2.ok ? result2.value[0] : null).toEqual({
      delay: 200,
      doubled: 400,
    });
    expect(result2.ok ? result2.value[1] : null).toBe(200);
  });

  test("passes through termination", () => {
    const deps = createScheduleDeps();
    const step = mapSchedule((n: number) => n + 1)(take(1)(forever))(deps);
    expectOk(step(undefined), [1, 0]);
    expectDone(step(undefined));
  });
});

describe("passthrough", () => {
  test("as constructor outputs input directly", () => {
    const deps = createScheduleDeps();

    interface MyError {
      readonly code: number;
      readonly message: string;
    }

    const step = passthrough<MyError>()(deps);
    const error1: MyError = { code: 500, message: "Internal error" };
    const error2: MyError = { code: 429, message: "Rate limited" };

    const result1 = step(error1);
    expectOk(result1, [error1, 0]);

    const result2 = step(error2);
    expectOk(result2, [error2, 0]);
  });

  test("as combinator preserves timing, replaces output", () => {
    const deps = createScheduleDeps();

    interface MyError {
      readonly code: number;
    }

    const step = passthrough(exponential("100ms"))(deps);
    const error: MyError = { code: 500 };

    const result1 = step(error);
    expectOk(result1, [error, 100]); // output is input, delay from exponential

    const result2 = step({ code: 429 });
    expectOk(result2, [{ code: 429 }, 200]); // exponential growth

    const result3 = step({ code: 503 });
    expectOk(result3, [{ code: 503 }, 400]);
  });

  test("combinator respects schedule termination", () => {
    const deps = createScheduleDeps();
    const step = passthrough(take(2)(spaced("100ms")))(deps);

    expectOk(step("first"), ["first", 100]);
    expectOk(step("second"), ["second", 100]);
    expectDone(step("third")); // take(2) exhausted
  });
});

describe("foldSchedule", () => {
  test("accumulates state across iterations", () => {
    const deps = createScheduleDeps();

    // Track cumulative delay
    const schedule = foldSchedule(
      0,
      (total: number, delay: Millis) => total + delay,
    )(take(4)(exponential("100ms")));
    const step = schedule(deps);

    expectOk(step(undefined), [100, 100]); // 0 + 100
    expectOk(step(undefined), [300, 200]); // 100 + 200
    expectOk(step(undefined), [700, 400]); // 300 + 400
    expectOk(step(undefined), [1500, 800]); // 700 + 800
    expectDone(step(undefined));
  });
});

describe("repetitions", () => {
  test("outputs count instead of original output", () => {
    const deps = createScheduleDeps();

    const schedule = repetitions(exponential("100ms"));
    const step = schedule(deps);

    expectOk(step(undefined), [0, 100]);
    expectOk(step(undefined), [1, 200]);
    expectOk(step(undefined), [2, 400]);
  });
});

describe("delays", () => {
  test("outputs the delay instead of original output", () => {
    const deps = createScheduleDeps();

    const schedule = delays(exponential("100ms"));
    const step = schedule(deps);

    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [400, 400]);
  });

  test("passes through termination", () => {
    const deps = createScheduleDeps();
    const step = delays(take(1)(spaced("100ms")))(deps);
    expectOk(step(undefined), [100, 100]);
    expectDone(step(undefined));
  });
});

describe("collectAllScheduleOutputs", () => {
  test("accumulates outputs into array", () => {
    const deps = createScheduleDeps();
    const schedule = collectAllScheduleOutputs(take(3)(spaced("100ms")));
    const step = schedule(deps);

    expectOk(step(undefined), [[100], 100]);
    expectOk(step(undefined), [[100, 100], 100]);
    expectOk(step(undefined), [[100, 100, 100], 100]);
    expectDone(step(undefined));
  });

  test("returns a new snapshot without changing previous outputs", () => {
    const step = collectAllScheduleOutputs(take(2)(spaced("100ms")))(
      createScheduleDeps(),
    );

    const first = step(undefined);
    expectOk(first, [[100], 100]);
    expectOk(step(undefined), [[100, 100], 100]);
    expectOk(first, [[100], 100]);
  });
});

describe("collectScheduleInputs", () => {
  test("accumulates inputs into array", () => {
    const deps = createScheduleDeps();
    const schedule = collectScheduleInputs(take(3)(spaced("100ms")));
    const step = schedule(deps);

    expectOk(step("a"), [["a"], 100]);
    expectOk(step("b"), [["a", "b"], 100]);
    expectOk(step("c"), [["a", "b", "c"], 100]);
    expectDone(step("d"));
  });
});

describe("collectWhileScheduleOutput", () => {
  test("collects outputs while predicate is true", () => {
    const deps = createScheduleDeps();
    const schedule = collectWhileScheduleOutput((delay: Millis) => delay < 400)(
      exponential("100ms"),
    );
    const step = schedule(deps);

    expectOk(step(undefined), [[100], 100]);
    expectOk(step(undefined), [[100, 200], 200]);
    // 400 >= 400, predicate fails, stops
    expectDone(step(undefined));
  });
});

describe("collectUntilScheduleOutput", () => {
  test("collects outputs until predicate becomes true", () => {
    const deps = createScheduleDeps();
    const schedule = collectUntilScheduleOutput(
      (delay: Millis) => delay >= 400,
    )(exponential("100ms"));
    const step = schedule(deps);

    expectOk(step(undefined), [[100], 100]);
    expectOk(step(undefined), [[100, 200], 200]);
    // 400 >= 400, predicate true, stops
    expectDone(step(undefined));
  });
});

describe("sequenceSchedules", () => {
  test("runs schedules in order", () => {
    const deps = createScheduleDeps();

    const step = sequenceSchedules(
      take(2)(exponential("100ms")),
      take(3)(spaced("500ms")),
    )(deps);

    // First schedule runs
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    // First exhausted, second takes over
    expectOk(step(undefined), [500, 500]);
    expectOk(step(undefined), [500, 500]);
    expectOk(step(undefined), [500, 500]);
    // Second exhausted
    expectDone(step(undefined));
  });

  test("handles three schedules", () => {
    const deps = createScheduleDeps();

    const step = sequenceSchedules(
      take(1)(spaced("100ms")),
      take(1)(spaced("200ms")),
      take(1)(spaced("300ms")),
    )(deps);

    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [300, 300]);
    expectDone(step(undefined));
  });

  test("stops immediately for empty list", () => {
    const deps = createScheduleDeps();
    const step = sequenceSchedules()(deps);
    expectDone(step(undefined));
  });
});

describe("intersectSchedules", () => {
  test("continues while both want to continue", () => {
    const deps = createScheduleDeps();

    const a = take(2)(spaced("100ms"));
    const b = take(4)(spaced("200ms"));
    const step = intersectSchedules(a, b)(deps);

    expectOk(step(undefined), [[100, 200], 200]); // max(100, 200)
    expectOk(step(undefined), [[100, 200], 200]); // max(100, 200)
    expectDone(step(undefined)); // a stopped, so intersection stops
  });

  test("does not step children after the intersection stops", () => {
    let aCalls = 0;
    let bCalls = 0;
    const step = intersectSchedules(
      tapScheduleInput(() => aCalls++)(take(1)(spaced("100ms"))),
      tapScheduleInput(() => bCalls++)(spaced("200ms")),
    )(createScheduleDeps());

    expectOk(step(undefined), [[100, 200], 200]);
    expectDone(step(undefined));
    expectDone(step(undefined));
    expect([aCalls, bCalls]).toEqual([2, 2]);
  });
});

describe("unionSchedules", () => {
  test("continues while either wants to continue", () => {
    const deps = createScheduleDeps();

    const a = take(2)(spaced("100ms"));
    const b = take(4)(spaced("200ms"));
    const step = unionSchedules(a, b)(deps);

    expectOk(step(undefined), [100, 100]); // min(100, 200)
    expectOk(step(undefined), [100, 100]); // min(100, 200)
    expectOk(step(undefined), [200, 200]); // a stopped, b continues
    expectOk(step(undefined), [200, 200]);
    expectDone(step(undefined)); // both stopped
  });

  test("continues when second schedule stops first", () => {
    const deps = createScheduleDeps();

    const a = take(2)(spaced("200ms"));
    const b = take(1)(spaced("100ms"));
    const step = unionSchedules(a, b)(deps);

    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectDone(step(undefined));
  });

  test("returns output from the shorter delay", () => {
    const deps = createScheduleDeps();

    const a = mapSchedule(() => "a")(spaced("200ms"));
    const b = mapSchedule(() => "b")(spaced("100ms"));
    const step = unionSchedules(a, b)(deps);

    expectOk(step(undefined), ["b", 100]);
  });

  test("does not step completed children", () => {
    let aCalls = 0;
    let bCalls = 0;
    const step = unionSchedules(
      tapScheduleInput(() => aCalls++)(take(1)(spaced("100ms"))),
      tapScheduleInput(() => bCalls++)(take(3)(spaced("200ms"))),
    )(createScheduleDeps());

    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [200, 200]);
    expect([aCalls, bCalls]).toEqual([2, 3]);
    expectDone(step(undefined));
    expectDone(step(undefined));
    expect([aCalls, bCalls]).toEqual([2, 4]);
  });
});

describe("whenInput", () => {
  test("maintains independent branch state", () => {
    const step = whenInput(
      (useAlt: boolean) => useAlt,
      exponential("1s"),
    )(exponential("100ms"))(createScheduleDeps());

    expectOk(step(false), [100, 100]);
    expectOk(step(true), [1000, 1000]);
    expectOk(step(false), [200, 200]);
    expectOk(step(true), [2000, 2000]);
  });

  test("shares an outer attempt limit across branches", () => {
    const step = take(3)(
      whenInput(
        (useAlt: boolean) => useAlt,
        exponential("1s"),
      )(exponential("100ms")),
    )(createScheduleDeps());

    expectOk(step(false), [100, 100]);
    expectOk(step(true), [1000, 1000]);
    expectOk(step(false), [200, 200]);
    expectDone(step(true));
  });

  test("passes through termination from alt schedule", () => {
    const deps = createScheduleDeps();

    const step = whenInput(() => true, take(1)(spaced("1s")))(spaced("100ms"))(
      deps,
    );

    expectOk(step(undefined), [1000, 1000]);
    expectDone(step(undefined));
  });

  test("keeps terminal done when the selected branch changes", () => {
    const step = whenInput(
      (useAlt: boolean) => useAlt,
      take(1)(spaced("1s")),
    )(exponential("100ms"))(createScheduleDeps());

    expectOk(step(false), [100, 100]);
    expectOk(step(false), [200, 200]);
    expectOk(step(true), [1000, 1000]);
    expectDone(step(true));
    expectDone(step(false));
  });
});

describe("tapScheduleOutput", () => {
  test("executes side effect without altering schedule", () => {
    const deps = createScheduleDeps();

    const outputs: Array<Millis> = [];
    const step = tapScheduleOutput((delay: Millis) => {
      outputs.push(delay);
    })(take(3)(exponential("100ms")))(deps);

    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [400, 400]);
    expectDone(step(undefined));

    expect(outputs).toEqual([100, 200, 400]);
  });

  test("does not call effect when schedule stops", () => {
    const deps = createScheduleDeps();

    const outputs: Array<number> = [];
    const step = tapScheduleOutput((n: number) => {
      outputs.push(n);
    })(take(2)(forever))(deps);

    step(undefined);
    step(undefined);
    step(undefined); // Err(Done<void>)

    expect(outputs).toEqual([0, 1]);
  });
});

describe("tapScheduleInput", () => {
  test("executes side effect on input without altering schedule", () => {
    const deps = createScheduleDeps();

    const inputs: Array<string> = [];
    const step = tapScheduleInput((input: string) => {
      inputs.push(input);
    })(take(3)(spaced("100ms")))(deps);

    expectOk(step("error1"), [100, 100]);
    expectOk(step("error2"), [100, 100]);
    expectOk(step("error3"), [100, 100]);
    expectDone(step("error4"));

    expect(inputs).toEqual(["error1", "error2", "error3", "error4"]);
  });

  test("is called even when schedule stops", () => {
    const deps = createScheduleDeps();

    const inputs: Array<string> = [];
    const step = tapScheduleInput((input: string) => {
      inputs.push(input);
    })(take(1)(forever))(deps);

    step("first");
    step("second"); // Err(Done<void>) but tap still runs

    expect(inputs).toEqual(["first", "second"]);
  });
});

describe("retryStrategyAws", () => {
  test("uses AWS 2.1 ordinary-failure timing", () => {
    // RandomNumber is below 1; millisecond rounding reaches the 50ms upper bound.
    const step = retryStrategyAws(
      createScheduleDepsWithRandom(0.999999999 as RandomNumber),
    );

    expectOk(step(undefined), [50, 50]);
    expectOk(step(undefined), [100, 100]);
    expectDone(step(undefined));
  });
});
