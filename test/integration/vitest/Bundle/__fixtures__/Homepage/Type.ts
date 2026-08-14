import { Number, object, String } from "@evolu/common";

const Person = object({
  name: String,
  age: Number,
});

const result = Person.fromUnknown({ name: "Ada", age: 42 });

(
  globalThis as typeof globalThis & { __evoluTreeShaking?: unknown }
).__evoluTreeShaking = result;

export default 42;
