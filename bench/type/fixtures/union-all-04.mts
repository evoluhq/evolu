import { type InferErrors } from "./chains/api.mts";
import { U4 } from "./chains/union-04.mts";

export type Output = typeof U4.Output;
export type Errors = InferErrors<typeof U4>;
export type FromUnknownInput = Parameters<typeof U4.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof U4.fromUnknown>;
export type FromInput = Parameters<typeof U4.from>[0];
export type FromResult = ReturnType<typeof U4.from>;
export type FromParentInput = Parameters<typeof U4.from.parent>[0];
export type FromParentResult = ReturnType<typeof U4.from.parent>;
export type Members = typeof U4.members;
export type Parent = typeof U4.parent;
