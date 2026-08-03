import { type InferErrors } from "./chains/api.mts";
import { U2 } from "./chains/union-02.mts";

export type Output = typeof U2.Output;
export type Errors = InferErrors<typeof U2>;
export type FromUnknownInput = Parameters<typeof U2.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof U2.fromUnknown>;
export type FromInput = Parameters<typeof U2.from>[0];
export type FromResult = ReturnType<typeof U2.from>;
export type FromParentInput = Parameters<typeof U2.from.parent>[0];
export type FromParentResult = ReturnType<typeof U2.from.parent>;
export type Members = typeof U2.members;
export type Parent = typeof U2.parent;
