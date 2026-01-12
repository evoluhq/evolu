import { describe, expect, test } from "vitest";
import { RandomNumber } from "../../src/Random.js";
import { done, err, NextResult, ok } from "../../src/Result.js";
import {
  addDelay,
  collectAllOutputs,
  collectInputs,
  collectUntil,
  collectWhile,
  compensateExecution,
  delayed,
  delays,
  during,
  elapsed,
  exponential,
  fibonacci,
  fixed,
  fold,
  forever,
  fromDelay,
  fromDelays,
  intersect,
  jitter,
  linear,
  map,
  maxDelay,
  maxElapsed,
  modifyDelay,
  once,
  passthrough,
  recurs,
  repetitions,
  resetAfter,
  retryStrategyAws,
  retryStrategyAwsThrottled,
  Schedule,
  sequence,
  spaced,
  succeed,
  take,
  tapInput,
  tapOutput,
  unfold,
  union,
  untilInput,
  untilOutput,
  whenInput,
  whileInput,
  whileOutput,
  windowed,
} from "../../src/schedule/index.js";
import {
  createTestTime,
  maxMillis,
  Millis,
  minMillis,
} from "../../src/Time.js";
import { testRandom } from "../_deps.js";

// Helper to create deps with controllable time
const createDeps = (startAt = 0) => {
  const time = createTestTime({ startAt: startAt as Millis });
  return { time, random: testRandom };
};

// Default deps starting at T=0
const deps = createDeps();

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
        const delay = (100 * attempt) as Millis;
        return ok([{ attempt, delay }, delay]);
      };
    };

    // Create a schedule that outputs less detailed info
    const lessDetailedSchedule: Schedule<{ readonly attempt: number }> = () => {
      let attempt = 0;
      return () => {
        attempt++;
        const delay = (100 * attempt) as Millis;
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
    const step = forever(deps);
    expectOk(step(undefined), [0, 0]);
    expectOk(step(undefined), [1, 0]);
    expectOk(step(undefined), [2, 0]);
  });
});

describe("once", () => {
  test("runs exactly once", () => {
    const step = once(deps);
    expectOk(step(undefined), [0, 0]);
    expectDone(step(undefined));
  });
});

describe("recurs", () => {
  test("limits repetitions", () => {
    const step = recurs(3)(deps);
    expectOk(step(undefined), [0, 0]);
    expectOk(step(undefined), [1, 0]);
    expectOk(step(undefined), [2, 0]);
    expectDone(step(undefined));
  });
});

describe("spaced", () => {
  test("returns constant delay", () => {
    const step = spaced("100ms")(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [100, 100]);
  });
});

describe("exponential", () => {
  test("grows by factor", () => {
    const step = exponential("100ms")(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [400, 400]);
    expectOk(step(undefined), [800, 800]);
  });

  test("with custom factor", () => {
    const step = exponential("100ms", 3)(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [300, 300]);
    expectOk(step(undefined), [900, 900]);
  });

  test("with fractional factor rounds to millis", () => {
    const step = exponential("100ms", 1.5)(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [150, 150]);
    expectOk(step(undefined), [225, 225]);
    expectOk(step(undefined), [338, 338]);
  });

  test("states are independent (stateful)", () => {
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
});

describe("linear", () => {
  test("grows linearly", () => {
    const step = linear("100ms")(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [300, 300]);
    expectOk(step(undefined), [400, 400]);
  });
});

describe("fibonacci", () => {
  test("grows by fibonacci sequence", () => {
    const step = fibonacci("100ms")(deps);
    // F(1)=1, F(2)=1, F(3)=2, F(4)=3, F(5)=5, F(6)=8
    expectOk(step(undefined), [100, 100]); // 100 * 1
    expectOk(step(undefined), [100, 100]); // 100 * 1
    expectOk(step(undefined), [200, 200]); // 100 * 2
    expectOk(step(undefined), [300, 300]); // 100 * 3
    expectOk(step(undefined), [500, 500]); // 100 * 5
    expectOk(step(undefined), [800, 800]); // 100 * 8
  });
});

describe("fixed", () => {
  test("aligns to window boundaries", () => {
    const d = createDeps();
    const step = fixed("10s")(d);

    // First execution at T=0, outputs count 0, wait 10s to align to first window
    expectOk(step(undefined), [0, 10000]);

    // Second at T=13 (3s into second window), outputs count 1
    // Next window boundary is at T=20, so wait 7s
    d.time.advance("13s");
    expectOk(step(undefined), [1, 7000]);

    // Third at T=27 (7s into third window), outputs count 2
    // Next window boundary is at T=30, so wait 3s
    d.time.advance("14s"); // now at 27s
    expectOk(step(undefined), [2, 3000]);

    // Fourth at T=35 (5s into fourth window), outputs count 3
    // Next window boundary is at T=40, so wait 5s
    d.time.advance("8s"); // now at 35s
    expectOk(step(undefined), [3, 5000]);
  });

  test("handles running behind (execution > interval)", () => {
    const d = createDeps();
    const step = fixed("10s")(d);

    // First execution starts
    expectOk(step(undefined), [0, 10000]);

    // Execution took 25s, now at T=25 (should have run at T=10, T=20)
    // Running behind: delay is 0, but next boundary is T=30
    d.time.advance("25s");
    expectOk(step(undefined), [1, 0]);

    // Now at T=28, not running behind anymore, align to T=30
    d.time.advance("3s");
    expectOk(step(undefined), [2, 2000]);
  });

  test("with zero interval", () => {
    const d = createDeps();
    const step = fixed(minMillis)(d);
    expectOk(step(undefined), [0, 0]);
    d.time.advance("100ms");
    expectOk(step(undefined), [1, 0]);
    d.time.advance("100ms");
    expectOk(step(undefined), [2, 0]);
  });
});

describe("windowed", () => {
  test("with zero interval", () => {
    const d = createDeps();
    const step = windowed(minMillis)(d);
    expectOk(step(undefined), [0, 0]);
    d.time.advance("100ms");
    expectOk(step(undefined), [1, 0]);
    d.time.advance("100ms");
    expectOk(step(undefined), [2, 0]);
  });

  test("aligns to window boundaries", () => {
    const schedule = windowed("100ms");
    const d = createDeps();

    // At elapsed=0, wait full 100ms to next boundary
    const step = schedule(d);
    expectOk(step(undefined), [0, 100]);
    // At elapsed=30, wait 70ms to next boundary
    d.time.advance("30ms");
    expectOk(step(undefined), [1, 70]);
    // At elapsed=150 (30 + 120 more), wait 50ms to next boundary (200ms)
    d.time.advance("120ms");
    expectOk(step(undefined), [2, 50]);
  });
});

describe("fromDelay", () => {
  test("creates single-delay schedule", () => {
    const schedule = fromDelay("500ms");
    const step = schedule(deps);

    expectOk(step(undefined), [500, 500]);
    expectDone(step(undefined));
  });
});

describe("fromDelays", () => {
  test("creates sequence of delays", () => {
    const schedule = fromDelays("100ms", "500ms", "2s");
    const step = schedule(deps);

    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [500, 500]);
    expectOk(step(undefined), [2000, 2000]);
    expectDone(step(undefined));
  });
});

describe("elapsed", () => {
  test("outputs total elapsed time", () => {
    const d = createDeps();
    const step = elapsed(d);

    expectOk(step(undefined), [0, 0]);
    d.time.advance("100ms");
    expectOk(step(undefined), [100, 0]);
    d.time.advance("400ms");
    expectOk(step(undefined), [500, 0]);
    d.time.advance("500ms");
    expectOk(step(undefined), [1000, 0]);
  });

  test("combined with other schedule", () => {
    const d = createDeps();
    const step = intersect(take(3)(spaced("100ms")), elapsed)(d);

    const result1 = step(undefined);
    expect(result1.ok).toBe(true);
    expect(result1.ok ? result1.value[0][0] : null).toBe(100); // spaced output
    expect(result1.ok ? result1.value[0][1] : null).toBe(0); // elapsed output
    expect(result1.ok ? result1.value[1] : null).toBe(100); // max delay

    d.time.advance("150ms");
    const result2 = step(undefined);
    expect(result2.ok).toBe(true);
    expect(result2.ok ? result2.value[0][0] : null).toBe(100);
    expect(result2.ok ? result2.value[0][1] : null).toBe(150);

    d.time.advance("150ms");
    const result3 = step(undefined);
    expect(result3.ok).toBe(true);
    expect(result3.ok ? result3.value[0][0] : null).toBe(100);
    expect(result3.ok ? result3.value[0][1] : null).toBe(300);

    d.time.advance("100ms");
    expectDone(step(undefined)); // take(3) exhausted
  });
});

describe("during", () => {
  test("runs for specified duration then stops", () => {
    const schedule = during("100ms");
    const d = createDeps();
    const step = schedule(d);

    expectOk(step(undefined), [0, 0]);
    d.time.advance("50ms");
    expectOk(step(undefined), [50, 0]);
    d.time.advance("50ms");
    expectOk(step(undefined), [100, 0]); // exactly at limit
    d.time.advance("1ms");
    expectDone(step(undefined)); // over limit
  });
});

describe("succeed", () => {
  test("always outputs constant value", () => {
    const step = take(3)(succeed("retry"))(deps);
    expectOk(step(undefined), ["retry", 0]);
    expectOk(step(undefined), ["retry", 0]);
    expectOk(step(undefined), ["retry", 0]);
    expectDone(step(undefined));
  });
});

describe("unfold", () => {
  test("creates schedule from state function", () => {
    // Simple counter
    const step = take(4)(unfold(0, (n) => n + 1))(deps);

    expectOk(step(undefined), [0, 0]);
    expectOk(step(undefined), [1, 0]);
    expectOk(step(undefined), [2, 0]);
    expectOk(step(undefined), [3, 0]);
    expectDone(step(undefined));
  });

  test("with custom state transformation", () => {
    // Multiply by 2 each time
    const step = take(4)(unfold(1, (n) => n * 2))(deps);

    expectOk(step(undefined), [1, 0]);
    expectOk(step(undefined), [2, 0]);
    expectOk(step(undefined), [4, 0]);
    expectOk(step(undefined), [8, 0]);
  });

  test("with object state", () => {
    interface Phase {
      readonly name: string;
      readonly count: number;
    }

    const nextPhase = (phase: Phase): Phase => ({
      name: phase.count < 2 ? "warmup" : "active",
      count: phase.count + 1,
    });

    const step = take(4)(unfold({ name: "init", count: 0 }, nextPhase))(deps);

    expectOk(step(undefined), [{ name: "init", count: 0 }, 0]);
    expectOk(step(undefined), [{ name: "warmup", count: 1 }, 0]);
    expectOk(step(undefined), [{ name: "warmup", count: 2 }, 0]);
    expectOk(step(undefined), [{ name: "active", count: 3 }, 0]);
  });
});

describe("take", () => {
  test("limits attempts", () => {
    const step = take(3)(exponential("100ms"))(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [400, 400]);
    expectDone(step(undefined));
  });
});

describe("maxElapsed", () => {
  test("stops after duration", () => {
    const d = createDeps();
    const step = maxElapsed("250ms")(exponential("100ms"))(d);
    expectOk(step(undefined), [100, 100]);
    d.time.advance("100ms");
    expectOk(step(undefined), [200, 200]);
    d.time.advance("150ms"); // now at 250ms
    expectDone(step(undefined)); // elapsed >= 250
  });
});

describe("maxDelay", () => {
  test("caps delay", () => {
    const step = maxDelay("300ms")(exponential("100ms"))(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [400, 300]); // capped
    expectOk(step(undefined), [800, 300]); // capped
  });
});

describe("jitter", () => {
  test("randomizes delay", () => {
    // With deterministic random, we can test jitter
    const step = jitter(0.5)(spaced("100ms"))(deps);
    const result = step(undefined);
    expect(result.ok).toBe(true);
    const [, delay] = result.ok ? result.value : [0, 0];
    // With factor 0.5, delay should be between 50 and 150
    expect(delay).toBeGreaterThanOrEqual(50);
    expect(delay).toBeLessThanOrEqual(150);
  });

  test("validates Millis bounds", () => {
    const d = {
      time: createTestTime({ startAt: 0 as Millis }),
      random: { next: () => 0.999999999 as RandomNumber },
    };

    const step = jitter(1)(spaced(maxMillis))(d);
    expect(() => step(undefined)).toThrow();
  });
});

describe("delayed", () => {
  test("adds initial delay before first attempt", () => {
    const step = delayed("500ms")(exponential("100ms"))(deps);
    expectOk(step(undefined), [100, 500]); // Initial delay
    expectOk(step(undefined), [200, 200]); // Normal delays
    expectOk(step(undefined), [400, 400]);
  });

  test("does not override termination", () => {
    const step = delayed("500ms")(take(0)(forever))(deps);
    expectDone(step(undefined));
  });
});

describe("addDelay", () => {
  test("adds fixed delay to schedule", () => {
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
    // Double all delays
    const step = modifyDelay((d) => d * 2)(exponential("100ms"))(deps);
    expectOk(step(undefined), [100, 200]);
    expectOk(step(undefined), [200, 400]);
    expectOk(step(undefined), [400, 800]);
  });

  test("passes through termination", () => {
    const step = modifyDelay(() => 123)(take(1)(forever))(deps);
    expectOk(step(undefined), [0, 123]);
    expectDone(step(undefined));
  });
});

describe("compensateExecution", () => {
  test("subtracts execution time from delay", () => {
    const d = createDeps();
    const step = compensateExecution(spaced("1s"))(d);
    // First attempt at T=0, no previous → full delay
    expectOk(step(undefined), [1000, 1000]);
    // Second at T=200 (execution took 200ms) → wait 800ms
    d.time.advance("200ms");
    expectOk(step(undefined), [1000, 800]);
    // Third at T=1400 (execution took 1200ms since T=200) → wait 0ms
    d.time.advance("1.2s");
    expectOk(step(undefined), [1000, 0]);
  });

  test("passes through termination", () => {
    const d = createDeps();
    const step = compensateExecution(take(1)(spaced("1s")))(d);
    expectOk(step(undefined), [1000, 1000]);
    expectDone(step(undefined));
  });
});

describe("whileInput", () => {
  test("continues while predicate is true", () => {
    interface Error {
      readonly type: "Transient" | "Fatal";
    }
    const schedule = whileInput<Error>((e) => e.type === "Transient")(
      spaced("100ms"),
    );
    const step = schedule(deps);

    expectOk(step({ type: "Transient" }), [100, 100]);
    expectOk(step({ type: "Transient" }), [100, 100]);
    expectDone(step({ type: "Fatal" }));
  });
});

describe("untilInput", () => {
  test("stops when predicate becomes true", () => {
    interface Error {
      readonly type: "Transient" | "Fatal";
    }
    const schedule = untilInput<Error>((e) => e.type === "Fatal")(
      spaced("100ms"),
    );
    const step = schedule(deps);

    expectOk(step({ type: "Transient" }), [100, 100]);
    expectOk(step({ type: "Transient" }), [100, 100]);
    expectDone(step({ type: "Fatal" }));
  });
});

describe("whileOutput", () => {
  test("continues while predicate is true", () => {
    // Stop when delay exceeds 300ms
    const step = whileOutput((delay: Millis) => delay <= 300)(
      exponential("100ms"),
    )(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectDone(step(undefined)); // 400 > 300
  });

  test("passes through termination", () => {
    const step = whileOutput(() => true)(take(1)(forever))(deps);
    expectOk(step(undefined), [0, 0]);
    expectDone(step(undefined));
  });
});

describe("untilOutput", () => {
  test("stops when predicate becomes true", () => {
    // Stop when delay reaches 400ms
    const step = untilOutput((delay: Millis) => delay >= 400)(
      exponential("100ms"),
    )(deps);
    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectDone(step(undefined)); // 400 >= 400
  });

  test("passes through termination", () => {
    const step = untilOutput(() => false)(take(1)(forever))(deps);
    expectOk(step(undefined), [0, 0]);
    expectDone(step(undefined));
  });
});

describe("resetAfter", () => {
  test("resets schedule after inactivity", () => {
    const d = createDeps();
    const step = resetAfter("1s")(take(2)(spaced("100ms")))(d);
    // First two attempts with short gaps (less than reset threshold)
    expectOk(step(undefined), [100, 100]);
    d.time.advance("100ms");
    expectOk(step(undefined), [100, 100]);
    // Schedule exhausted
    d.time.advance("100ms");
    expectDone(step(undefined));

    // Test reset: after 1s+ gap, schedule resets
    const d2 = createDeps();
    const step2 = resetAfter("1s")(take(2)(spaced("100ms")))(d2);
    expectOk(step2(undefined), [100, 100]);
    // Gap of 2000ms triggers reset, so we get fresh state
    d2.time.advance("2s");
    expectOk(step2(undefined), [100, 100]);
    // Another short gap, count continues from fresh state
    d2.time.advance("100ms");
    expectOk(step2(undefined), [100, 100]);
    // Now exhausted again
    d2.time.advance("100ms");
    expectDone(step2(undefined));
  });
});

describe("map", () => {
  test("transforms output", () => {
    const schedule = map((delay: Millis) => ({
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
    const step = map((n: number) => n + 1)(take(1)(forever))(deps);
    expectOk(step(undefined), [1, 0]);
    expectDone(step(undefined));
  });
});

describe("passthrough", () => {
  test("as constructor outputs input directly", () => {
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
    const step = passthrough(take(2)(spaced("100ms")))(deps);

    expectOk(step("first"), ["first", 100]);
    expectOk(step("second"), ["second", 100]);
    expectDone(step("third")); // take(2) exhausted
  });
});

describe("fold", () => {
  test("accumulates state across iterations", () => {
    // Track cumulative delay
    const schedule = fold(
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
    const schedule = repetitions(exponential("100ms"));
    const step = schedule(deps);

    expectOk(step(undefined), [0, 100]);
    expectOk(step(undefined), [1, 200]);
    expectOk(step(undefined), [2, 400]);
  });
});

describe("delays", () => {
  test("outputs the delay instead of original output", () => {
    const schedule = delays(exponential("100ms"));
    const step = schedule(deps);

    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [400, 400]);
  });

  test("passes through termination", () => {
    const step = delays(take(1)(spaced("100ms")))(deps);
    expectOk(step(undefined), [100, 100]);
    expectDone(step(undefined));
  });
});

describe("collectAllOutputs", () => {
  test("accumulates outputs into array", () => {
    const schedule = collectAllOutputs(take(3)(spaced("100ms")));
    const step = schedule(deps);

    expectOk(step(undefined), [[100], 100]);
    expectOk(step(undefined), [[100, 100], 100]);
    expectOk(step(undefined), [[100, 100, 100], 100]);
    expectDone(step(undefined));
  });
});

describe("collectInputs", () => {
  test("accumulates inputs into array", () => {
    const schedule = collectInputs(take(3)(spaced("100ms")));
    const step = schedule(deps);

    expectOk(step("a"), [["a"], 100]);
    expectOk(step("b"), [["a", "b"], 100]);
    expectOk(step("c"), [["a", "b", "c"], 100]);
    expectDone(step("d"));
  });
});

describe("collectWhile", () => {
  test("collects outputs while predicate is true", () => {
    const schedule = collectWhile((delay: Millis) => delay < 400)(
      exponential("100ms"),
    );
    const step = schedule(deps);

    expectOk(step(undefined), [[100], 100]);
    expectOk(step(undefined), [[100, 200], 200]);
    // 400 >= 400, predicate fails, stops
    expectDone(step(undefined));
  });
});

describe("collectUntil", () => {
  test("collects outputs until predicate becomes true", () => {
    const schedule = collectUntil((delay: Millis) => delay >= 400)(
      exponential("100ms"),
    );
    const step = schedule(deps);

    expectOk(step(undefined), [[100], 100]);
    expectOk(step(undefined), [[100, 200], 200]);
    // 400 >= 400, predicate true, stops
    expectDone(step(undefined));
  });
});

describe("sequence", () => {
  test("runs schedules in order", () => {
    const step = sequence(
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
    const step = sequence(
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
    const step = sequence()(deps);
    expectDone(step(undefined));
  });
});

describe("intersect", () => {
  test("continues while both want to continue", () => {
    const a = take(2)(spaced("100ms"));
    const b = take(4)(spaced("200ms"));
    const step = intersect(a, b)(deps);

    expectOk(step(undefined), [[100, 200], 200]); // max(100, 200)
    expectOk(step(undefined), [[100, 200], 200]); // max(100, 200)
    expectDone(step(undefined)); // a stopped, so intersection stops
  });
});

describe("union", () => {
  test("continues while either wants to continue", () => {
    const a = take(2)(spaced("100ms"));
    const b = take(4)(spaced("200ms"));
    const step = union(a, b)(deps);

    expectOk(step(undefined), [100, 100]); // min(100, 200)
    expectOk(step(undefined), [100, 100]); // min(100, 200)
    expectOk(step(undefined), [200, 200]); // a stopped, b continues
    expectOk(step(undefined), [200, 200]);
    expectDone(step(undefined)); // both stopped
  });

  test("continues when second schedule stops first", () => {
    const a = take(2)(spaced("200ms"));
    const b = take(1)(spaced("100ms"));
    const step = union(a, b)(deps);

    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectDone(step(undefined));
  });

  test("returns output from the shorter delay", () => {
    const a = map(() => "a")(spaced("200ms"));
    const b = map(() => "b")(spaced("100ms"));
    const step = union(a, b)(deps);

    expectOk(step(undefined), ["b", 100]);
  });
});

describe("whenInput", () => {
  test("selects schedule based on input", () => {
    interface MyError {
      readonly type: "Throttled" | "NetworkError";
    }

    const isThrottled = (error: MyError) => error.type === "Throttled";

    const step = whenInput<MyError, Millis>(
      isThrottled,
      spaced("1s"),
    )(spaced("100ms"))(deps);

    // Normal error uses base schedule
    expectOk(step({ type: "NetworkError" }), [100, 100]);

    // Throttled error uses throttled schedule
    expectOk(step({ type: "Throttled" }), [1000, 1000]);

    // Another normal error uses base schedule
    expectOk(step({ type: "NetworkError" }), [100, 100]);
  });

  test("passes through termination from alt schedule", () => {
    const step = whenInput(() => true, take(1)(spaced("1s")))(spaced("100ms"))(
      deps,
    );

    expectOk(step(undefined), [1000, 1000]);
    expectDone(step(undefined));
  });
});

describe("tapOutput", () => {
  test("executes side effect without altering schedule", () => {
    const outputs: Array<Millis> = [];
    const step = tapOutput((delay: Millis) => {
      outputs.push(delay);
    })(take(3)(exponential("100ms")))(deps);

    expectOk(step(undefined), [100, 100]);
    expectOk(step(undefined), [200, 200]);
    expectOk(step(undefined), [400, 400]);
    expectDone(step(undefined));

    expect(outputs).toEqual([100, 200, 400]);
  });

  test("does not call effect when schedule stops", () => {
    const outputs: Array<number> = [];
    const step = tapOutput((n: number) => {
      outputs.push(n);
    })(take(2)(forever))(deps);

    step(undefined);
    step(undefined);
    step(undefined); // Err(Done<void>)

    expect(outputs).toEqual([0, 1]);
  });
});

describe("tapInput", () => {
  test("executes side effect on input without altering schedule", () => {
    const inputs: Array<string> = [];
    const step = tapInput((input: string) => {
      inputs.push(input);
    })(take(3)(spaced("100ms")))(deps);

    expectOk(step("error1"), [100, 100]);
    expectOk(step("error2"), [100, 100]);
    expectOk(step("error3"), [100, 100]);
    expectDone(step("error4"));

    expect(inputs).toEqual(["error1", "error2", "error3", "error4"]);
  });

  test("is called even when schedule stops", () => {
    const inputs: Array<string> = [];
    const step = tapInput((input: string) => {
      inputs.push(input);
    })(take(1)(forever))(deps);

    step("first");
    step("second"); // Err(Done<void>) but tap still runs

    expect(inputs).toEqual(["first", "second"]);
  });
});

describe("retryStrategyAws", () => {
  test("configuration", () => {
    // Just verify it produces steps correctly
    const step = retryStrategyAws(deps);
    const result = step(undefined);
    expect(result.ok).toBe(true);
    const [, delay] = result.ok ? result.value : [0, 0];
    expect(delay).toBeLessThanOrEqual(200); // 100ms * 2 (jitter upper bound)
  });
});

describe("retryStrategyAwsThrottled", () => {
  test("has higher base delay", () => {
    const normalStep = retryStrategyAws(deps);
    const throttledStep = retryStrategyAwsThrottled(deps);

    // Run multiple times to get past jitter variance
    // Throttled should generally have higher delays (1s vs 100ms base)
    const normalDelays: Array<number> = [];
    const throttledDelays: Array<number> = [];

    for (let i = 0; i < 3; i++) {
      const normal = normalStep(undefined);
      const throttled = throttledStep(undefined);
      if (normal.ok) normalDelays.push(normal.value[1]);
      if (throttled.ok) throttledDelays.push(throttled.value[1]);
    }

    // Throttled delays should be approximately 10x higher on average
    const normalSum = normalDelays.reduce((a, b) => a + b, 0);
    const throttledSum = throttledDelays.reduce((a, b) => a + b, 0);
    expect(throttledSum).toBeGreaterThan(normalSum);
  });
});
