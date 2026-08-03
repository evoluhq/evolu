import { type InferErrors } from "./chains/api.mts";
import { MU16 } from "./chains/mixed-union-16.mts";

export type Output = typeof MU16.Output;
export type Errors = InferErrors<typeof MU16>;
export type FromUnknownInput = Parameters<typeof MU16.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof MU16.fromUnknown>;
export type FromInput = Parameters<typeof MU16.from>[0];
export type FromResult = ReturnType<typeof MU16.from>;
export type FromParentInput = Parameters<typeof MU16.from.parent>[0];
export type FromParentResult = ReturnType<typeof MU16.from.parent>;
export type Members = typeof MU16.members;
export type Parent = typeof MU16.parent;
