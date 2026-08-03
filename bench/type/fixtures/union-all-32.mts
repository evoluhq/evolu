import { type InferErrors } from "./chains/api.mts";
import { U32 } from "./chains/union-32.mts";

export type Output = typeof U32.Output;
export type Errors = InferErrors<typeof U32>;
export type FromUnknownInput = Parameters<typeof U32.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof U32.fromUnknown>;
export type FromInput = Parameters<typeof U32.from>[0];
export type FromResult = ReturnType<typeof U32.from>;
export type FromParentInput = Parameters<typeof U32.from.parent>[0];
export type FromParentResult = ReturnType<typeof U32.from.parent>;
export type Members = typeof U32.members;
export type Parent = typeof U32.parent;
