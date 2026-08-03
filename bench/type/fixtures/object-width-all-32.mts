import { object, optional, type InferErrors } from "./chains/api.mts";
import { T1 } from "./chains/factory-01.mts";

const O = object({
  required01: T1,
  required02: T1,
  required03: T1,
  required04: T1,
  required05: T1,
  required06: T1,
  required07: T1,
  required08: T1,
  required09: T1,
  required10: T1,
  required11: T1,
  required12: T1,
  required13: T1,
  required14: T1,
  required15: T1,
  required16: T1,
  optional01: optional(T1),
  optional02: optional(T1),
  optional03: optional(T1),
  optional04: optional(T1),
  optional05: optional(T1),
  optional06: optional(T1),
  optional07: optional(T1),
  optional08: optional(T1),
  optional09: optional(T1),
  optional10: optional(T1),
  optional11: optional(T1),
  optional12: optional(T1),
  optional13: optional(T1),
  optional14: optional(T1),
  optional15: optional(T1),
  optional16: optional(T1),
});
void O;

export type Output = typeof O.Output;
export type Errors = InferErrors<typeof O>;
export type FromUnknownInput = Parameters<typeof O.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof O.fromUnknown>;
export type FromInput = Parameters<typeof O.from>[0];
export type FromResult = ReturnType<typeof O.from>;
export type FromParentResult = ReturnType<typeof O.from.parent>;
