import { type InferErrors } from "./chains/api.mts";
import { MU8 } from "./chains/mixed-union-08.mts";

export type Output = typeof MU8.Output;
export type Errors = InferErrors<typeof MU8>;
export type FromUnknownInput = Parameters<typeof MU8.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof MU8.fromUnknown>;
export type FromInput = Parameters<typeof MU8.from>[0];
export type FromResult = ReturnType<typeof MU8.from>;
export type FromParentInput = Parameters<typeof MU8.from.parent>[0];
export type FromParentResult = ReturnType<typeof MU8.from.parent>;
export type Members = typeof MU8.members;
export type Parent = typeof MU8.parent;
