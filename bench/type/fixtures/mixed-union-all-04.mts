import { type InferErrors } from "./chains/api.mts";
import { MU4 } from "./chains/mixed-union-04.mts";

export type Output = typeof MU4.Output;
export type Errors = InferErrors<typeof MU4>;
export type FromUnknownInput = Parameters<typeof MU4.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof MU4.fromUnknown>;
export type FromInput = Parameters<typeof MU4.from>[0];
export type FromResult = ReturnType<typeof MU4.from>;
export type FromParentInput = Parameters<typeof MU4.from.parent>[0];
export type FromParentResult = ReturnType<typeof MU4.from.parent>;
export type Members = typeof MU4.members;
export type Parent = typeof MU4.parent;
