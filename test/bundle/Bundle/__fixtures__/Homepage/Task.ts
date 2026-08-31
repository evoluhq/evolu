import {
  createRun,
  fetch,
  Number,
  object,
  String,
  type FetchError,
  type InferErrors,
  type InferType,
  type NativeFetch,
  type Result,
  type Task,
} from "@evolu/common";

const User = object({
  name: String,
  age: Number,
});
interface User extends InferType<typeof User> {}

const fetchUser =
  (id: string): Task<User, FetchError | InferErrors<typeof User>> =>
  async (run) => {
    const response = await run(fetch(`/users/${id}`, "json"));
    if (!response.ok) return response;

    return User.fromUnknown(response.value);
  };

const nativeFetch: NativeFetch = () =>
  Promise.resolve(new Response(JSON.stringify({ name: "Ada", age: 42 })));

await using run = createRun({
  nativeFetch,
});

const result: Result<User, FetchError | InferErrors<typeof User>> = await run(
  fetchUser("123"),
);

(
  globalThis as typeof globalThis & { __evoluTreeShaking?: unknown }
).__evoluTreeShaking = result;

export default 42;
