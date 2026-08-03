import { object, optional, type InferErrors } from "./chains/api.mts";
import { T1 } from "./chains/factory-01.mts";

const O = object({
  required01: T1,
  required02: T1,
  optional01: optional(T1),
  optional02: optional(T1),
});
void O;

export type Output = typeof O.Output;
export type Errors = InferErrors<typeof O>;
export type FromUnknownInput = Parameters<typeof O.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof O.fromUnknown>;
export type FromInput = Parameters<typeof O.from>[0];
export type FromResult = ReturnType<typeof O.from>;
export type FromParentResult = ReturnType<typeof O.from.parent>;
