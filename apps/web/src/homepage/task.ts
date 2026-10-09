import {
  createRun,
  fetch,
  Number,
  object,
  String,
  type FetchError,
  type InferErrors,
  type InferType,
  type Task,
} from "@evolu/common";

const User = object({ name: String, age: Number });
interface User extends InferType<typeof User> {}

// The Task type says what it returns and each error it can return.
const fetchUser =
  (id: string): Task<User, FetchError | InferErrors<typeof User>> =>
  async (run) => {
    const response = await run(fetch(`/users/${id}`, "json"));
    if (!response.ok) return response;

    return User.fromUnknown(response.value);
  };

// Disposing the Run aborts its Tasks and waits for their cleanup.
await using run = createRun();

const result = await run(fetchUser("123"));
if (result.ok) console.log(result.value.name);
