import { FiniteNumber, NonEmptyString100, object } from "@evolu/common";

const Person = object({
  name: NonEmptyString100,
  age: FiniteNumber,
});

const keep = { Person };

(
  globalThis as typeof globalThis & { __evoluTreeShaking?: unknown }
).__evoluTreeShaking = keep;
