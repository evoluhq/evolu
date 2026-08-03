import {
  Number,
  object,
  String,
} from "../../../../../../packages/common/dist/src/Type2.js";

const Person = object({
  name: String,
  age: Number,
});

const keep = { Person };

(
  globalThis as typeof globalThis & { __evoluTreeShaking?: unknown }
).__evoluTreeShaking = keep;

export default 42;
