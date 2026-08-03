import { type InferErrors } from "./chains/api.mts";
import { LU2 } from "./chains/literal-union-02.mts";

export type Output = typeof LU2.Output;
export type Errors = InferErrors<typeof LU2>;
export type FromUnknownInput = Parameters<typeof LU2.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof LU2.fromUnknown>;
export type FromInput = Parameters<typeof LU2.from>[0];
export type FromResult = ReturnType<typeof LU2.from>;
export type FromParentInput = Parameters<typeof LU2.from.parent>[0];
export type FromParentResult = ReturnType<typeof LU2.from.parent>;
export type Members = typeof LU2.members;
export type Parent = typeof LU2.parent;
