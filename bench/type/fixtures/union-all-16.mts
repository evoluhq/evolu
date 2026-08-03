import { type InferErrors } from "./chains/api.mts";
import { U16 } from "./chains/union-16.mts";

export type Output = typeof U16.Output;
export type Errors = InferErrors<typeof U16>;
export type FromUnknownInput = Parameters<typeof U16.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof U16.fromUnknown>;
export type FromInput = Parameters<typeof U16.from>[0];
export type FromResult = ReturnType<typeof U16.from>;
export type FromParentInput = Parameters<typeof U16.from.parent>[0];
export type FromParentResult = ReturnType<typeof U16.from.parent>;
export type Members = typeof U16.members;
export type Parent = typeof U16.parent;
