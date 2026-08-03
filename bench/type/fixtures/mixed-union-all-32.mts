import { type InferErrors } from "./chains/api.mts";
import { MU32 } from "./chains/mixed-union-32.mts";

export type Output = typeof MU32.Output;
export type Errors = InferErrors<typeof MU32>;
export type FromUnknownInput = Parameters<typeof MU32.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof MU32.fromUnknown>;
export type FromInput = Parameters<typeof MU32.from>[0];
export type FromResult = ReturnType<typeof MU32.from>;
export type FromParentInput = Parameters<typeof MU32.from.parent>[0];
export type FromParentResult = ReturnType<typeof MU32.from.parent>;
export type Members = typeof MU32.members;
export type Parent = typeof MU32.parent;
