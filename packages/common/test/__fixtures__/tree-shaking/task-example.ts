import {
  AbortError,
  createRunner,
  tryAsync,
  type Result,
  type Task,
  type Typed,
} from "@evolu/common";

// A dependency — wraps native fetch for testability.
interface NativeFetchDep {
  readonly fetch: typeof globalThis.fetch;
}

interface FetchError extends Typed<"FetchError"> {
  readonly error: unknown;
}

// A Task wrapping native fetch — adds abortability.
const fetch =
  (url: string): Task<Response, FetchError, NativeFetchDep> =>
  ({ signal }, deps) =>
    tryAsync(
      () => deps.fetch(url, { signal }),
      (error): FetchError | AbortError => {
        if (AbortError.is(error)) return error;
        return { type: "FetchError", error };
      },
    );

// In a composition root…
const deps: NativeFetchDep = {
  fetch: () => Promise.reject(new Error("fetch not available")),
};

// Create runner with deps (passed to every task automatically).
await using run = createRunner(deps);

// Running a task returns a fiber that can be awaited.
const result: Result<Response, FetchError | AbortError> = await run(
  fetch("/users/123"),
);

const keep = { result };

(
  globalThis as typeof globalThis & { __evoluTreeShaking?: unknown }
).__evoluTreeShaking = keep;
