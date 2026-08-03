import { type InferErrors } from "./chains/api.mts";
import { U8 } from "./chains/union-08.mts";

export type Output = typeof U8.Output;
export type Errors = InferErrors<typeof U8>;
export type FromUnknownInput = Parameters<typeof U8.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof U8.fromUnknown>;
export type FromInput = Parameters<typeof U8.from>[0];
export type FromResult = ReturnType<typeof U8.from>;
export type FromParentInput = Parameters<typeof U8.from.parent>[0];
export type FromParentResult = ReturnType<typeof U8.from.parent>;
export type Members = typeof U8.members;
export type Parent = typeof U8.parent;
