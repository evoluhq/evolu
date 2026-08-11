import { FiniteNumber, NonEmptyTrimmedString100, object } from "@evolu/common";

const Person = object({
  name: NonEmptyTrimmedString100,
  age: FiniteNumber,
});

const keep = { Person };

(
  globalThis as typeof globalThis & { __evoluTreeShaking?: unknown }
).__evoluTreeShaking = keep;

export default 42;
