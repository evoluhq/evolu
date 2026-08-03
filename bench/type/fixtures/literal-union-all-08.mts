import { type InferErrors } from "./chains/api.mts";
import { LU8 } from "./chains/literal-union-08.mts";

export type Output = typeof LU8.Output;
export type Errors = InferErrors<typeof LU8>;
export type FromUnknownInput = Parameters<typeof LU8.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof LU8.fromUnknown>;
export type FromInput = Parameters<typeof LU8.from>[0];
export type FromResult = ReturnType<typeof LU8.from>;
export type FromParentInput = Parameters<typeof LU8.from.parent>[0];
export type FromParentResult = ReturnType<typeof LU8.from.parent>;
export type Members = typeof LU8.members;
export type Parent = typeof LU8.parent;
