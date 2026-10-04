/**
 * Clocks and pass loops of the protocol runtime benchmark's child processes. It
 * statically imports only Node.js modules and erased types.
 */
import type { RandomBytes } from "@evolu/common";
import { createPrng } from "../protocol/scenarios.mts";

/** The time one measured region took. */
export interface Timing {
  /** Thread CPU time, user plus system: the primary clock. */
  readonly cpuNs: number;
  readonly wallNs: number;
}

/**
 * Starts a measured region on both clocks and returns the function that ends
 * it.
 *
 * Thread CPU time counts only this thread, so neither other processes nor idle
 * waits add to it, while garbage collection on this thread does.
 */
export const startTiming = (): (() => Timing) => {
  const cpuStart = process.threadCpuUsage();
  const wallStart = process.hrtime.bigint();
  return () => {
    const wallNs = Number(process.hrtime.bigint() - wallStart);
    const { user, system } = process.threadCpuUsage(cpuStart);
    return { cpuNs: (user + system) * 1_000, wallNs };
  };
};

export const addTiming = (a: Timing, b: Timing): Timing => ({
  cpuNs: a.cpuNs + b.cpuNs,
  wallNs: a.wallNs + b.wallNs,
});

export const zeroTiming: Timing = { cpuNs: 0, wallNs: 0 };

/** The timings of one pass, by metric. */
export type PassTimings = Readonly<Record<string, Timing>>;

/** When a pass loop stops: after both minimums are reached. */
export interface PassRule {
  readonly minPasses: number;
  /** The minimum wall time of the measured regions together. */
  readonly minNs: number;
}

export const warmupRule: PassRule = { minPasses: 5, minNs: 100e6 };
export const measureRule: PassRule = { minPasses: 10, minNs: 400e6 };

/** Runs `pass` until `rule` is met and returns every pass's timings. */
export const runPasses = async (
  rule: PassRule,
  pass: () => Promise<PassTimings>,
): Promise<ReadonlyArray<PassTimings>> => {
  const passes: Array<PassTimings> = [];
  let measuredNs = 0;
  while (passes.length < rule.minPasses || measuredNs < rule.minNs) {
    const timings = await pass();
    passes.push(timings);
    for (const { wallNs } of Object.values(timings)) measuredNs += wallNs;
  }
  return passes;
};

/** Each metric's fastest CPU time and fastest wall time across passes. */
export const fastestTimings = (
  passes: ReadonlyArray<PassTimings>,
): PassTimings => {
  const fastest: Record<string, Timing> = {};
  for (const timings of passes) {
    for (const [metric, { cpuNs, wallNs }] of Object.entries(timings)) {
      const current = fastest[metric] as Timing | undefined;
      fastest[metric] =
        current === undefined
          ? { cpuNs, wallNs }
          : {
              cpuNs: Math.min(current.cpuNs, cpuNs),
              wallNs: Math.min(current.wallNs, wallNs),
            };
    }
  }
  return fastest;
};

/**
 * Random bytes from a pool generated in advance with the harness PRNG, so a
 * measured region pays no generation cost. It returns the same bytes as
 * `createSeededRandomBytes(seed)` in any request sizes, and `reset` starts the
 * stream over for the next pass.
 */
export const createRandomBytesPool = (
  seed: number,
  length: number,
): { readonly randomBytes: RandomBytes; readonly reset: () => void } => {
  const next = createPrng(seed);
  const pool = Uint8Array.from({ length }, () => Math.floor(next() * 256));
  let offset = 0;
  // RandomBytes types results by length; Evolu's implementations cast too.
  const randomBytes = {
    create: (bytesLength: number) => {
      if (offset + bytesLength > pool.length) {
        throw new Error("The random bytes pool is exhausted.");
      }
      offset += bytesLength;
      return pool.slice(offset - bytesLength, offset);
    },
  } as RandomBytes;
  return {
    randomBytes,
    reset: () => {
      offset = 0;
    },
  };
};
