import { type InferErrors } from "./chains/api.mts";
import { LU16 } from "./chains/literal-union-16.mts";

export type Output = typeof LU16.Output;
export type Errors = InferErrors<typeof LU16>;
export type FromUnknownInput = Parameters<typeof LU16.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof LU16.fromUnknown>;
export type FromInput = Parameters<typeof LU16.from>[0];
export type FromResult = ReturnType<typeof LU16.from>;
export type FromParentInput = Parameters<typeof LU16.from.parent>[0];
export type FromParentResult = ReturnType<typeof LU16.from.parent>;
export type Members = typeof LU16.members;
export type Parent = typeof LU16.parent;
