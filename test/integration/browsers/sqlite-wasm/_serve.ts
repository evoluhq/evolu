/**
 * Runs the steps a test sends to a harness worker, in a dedicated worker or in
 * a SharedWorker, one at a time, and answers each with what the step returned
 * or the error it threw. Results are cloned with errors replaced by their name
 * and message.
 *
 * @module
 */

import type { HarnessRequest, HarnessResponse } from "./_harness.ts";

/** The steps a worker runs, by name. */
export type WorkerSteps = Readonly<
  Record<string, (...args: Array<never>) => unknown>
>;

/**
 * Answers requests for the steps: from the page of a dedicated worker, or on
 * each port a SharedWorker is connected through.
 */
export const serveSteps = (steps: WorkerSteps): void => {
  if ("onconnect" in globalThis)
    addEventListener("connect", (event) => {
      const [port] = (event as MessageEvent).ports;
      servePort(steps, port);
      port.start();
    });
  else servePort(steps, globalThis);
};

/** The part of a worker's scope or a `MessagePort` the harness uses. */
interface HarnessPort {
  readonly addEventListener: (
    type: "message",
    listener: (event: MessageEvent<HarnessRequest>) => void,
  ) => void;
  readonly postMessage: (message: HarnessResponse) => void;
}

const servePort = (steps: WorkerSteps, port: HarnessPort): void => {
  // Each step starts when the previous one settles.
  let queue: Promise<void> = Promise.resolve();

  port.addEventListener("message", ({ data: { id, step, args } }) => {
    queue = queue.then(async () => {
      try {
        if (!Object.hasOwn(steps, step))
          throw new Error(`The worker has no step ${step}.`);
        const fn = steps[step] as (...args: ReadonlyArray<unknown>) => unknown;
        port.postMessage({
          id,
          ok: true,
          value: toCloneable(await fn(...args)),
        });
      } catch (error) {
        port.postMessage({
          id,
          ok: false,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message:
                    error.cause === undefined
                      ? error.message
                      : `${error.message}\nCause: ${describe(error.cause)}`,
                  stack: error.stack,
                }
              : { name: "Error", message: describe(error), stack: undefined },
        });
      }
    });
  });
};

/**
 * Replaces errors, such as the `DOMException` a pool records, with their name
 * and message, because not every engine can clone them.
 */
const toCloneable = (value: unknown): unknown => {
  if (value instanceof Error || value instanceof DOMException)
    return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map(toCloneable);
  if (value == null || typeof value !== "object") return value;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, toCloneable(nested)]),
  );
};

/** Describes a thrown value or a cause, with the name of an error. */
const describe = (value: unknown): string =>
  value instanceof Error || value instanceof DOMException
    ? `${value.name}: ${value.message}`
    : (JSON.stringify(value, (_key, nested: unknown) =>
        nested instanceof Error || nested instanceof DOMException
          ? describe(nested)
          : nested,
      ) ?? String(value));
