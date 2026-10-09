import {
  all,
  assertType,
  createRun,
  fetch,
  retry,
  retryStrategyAws,
  timeout,
  type FetchError,
  type RetryTaskError,
  type Task,
  type TimeoutError,
} from "@evolu/common";

interface ConfigDep {
  readonly config: { readonly apiUrl: string };
}

// A Task's type lists its result, its errors, and its dependencies.
const fetchUser =
  (id: string): Task<string, FetchError, ConfigDep> =>
  (run) =>
    run(fetch(`${run.deps.config.apiUrl}/users/${id}`, "text"));

// Timeout and retry wrap any Task, and its type keeps track of them.
const fetchUserResiliently = (id: string) =>
  retry(timeout(fetchUser(id), "30s"), retryStrategyAws);

assertType<
  ReturnType<typeof fetchUserResiliently>,
  Task<string, RetryTaskError<FetchError | TimeoutError>, ConfigDep>
>();

// Dependencies are provided once, at the composition root.
await using run = createRun({ config: { apiUrl: "https://api.example.com" } });

// At most 2 requests at a time. The first error aborts the rest, and leaving
// this scope aborts whatever still runs and waits for its cleanup.
const users = await run(
  all(["1", "2", "3"], fetchUserResiliently, { concurrency: 2 }),
);
if (users.ok) console.log(users.value);
