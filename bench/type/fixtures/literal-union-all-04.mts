import { type InferErrors } from "./chains/api.mts";
import { LU4 } from "./chains/literal-union-04.mts";

export type Output = typeof LU4.Output;
export type Errors = InferErrors<typeof LU4>;
export type FromUnknownInput = Parameters<typeof LU4.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof LU4.fromUnknown>;
export type FromInput = Parameters<typeof LU4.from>[0];
export type FromResult = ReturnType<typeof LU4.from>;
export type FromParentInput = Parameters<typeof LU4.from.parent>[0];
export type FromParentResult = ReturnType<typeof LU4.from.parent>;
export type Members = typeof LU4.members;
export type Parent = typeof LU4.parent;
