import { type InferErrors } from "./chains/api.mts";
import { LU32 } from "./chains/literal-union-32.mts";

export type Output = typeof LU32.Output;
export type Errors = InferErrors<typeof LU32>;
export type FromUnknownInput = Parameters<typeof LU32.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof LU32.fromUnknown>;
export type FromInput = Parameters<typeof LU32.from>[0];
export type FromResult = ReturnType<typeof LU32.from>;
export type FromParentInput = Parameters<typeof LU32.from.parent>[0];
export type FromParentResult = ReturnType<typeof LU32.from.parent>;
export type Members = typeof LU32.members;
export type Parent = typeof LU32.parent;
