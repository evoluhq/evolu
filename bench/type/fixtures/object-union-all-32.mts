import { type InferErrors } from "./chains/api.mts";
import { OU32 } from "./chains/object-union-32.mts";

export type Input = typeof OU32.Input;
export type Output = typeof OU32.Output;
export type Errors = InferErrors<typeof OU32>;
export type FromUnknownInput = Parameters<typeof OU32.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof OU32.fromUnknown>;
export type FromInput = Parameters<typeof OU32.from>[0];
export type FromResult = ReturnType<typeof OU32.from>;
export type FromParentInput = Parameters<typeof OU32.from.parent>[0];
export type FromParentResult = ReturnType<typeof OU32.from.parent>;
export type ToInput = Parameters<typeof OU32.to>[0];
export type ToResult = ReturnType<typeof OU32.to>;
export type Members = typeof OU32.members;
export type Parent = typeof OU32.parent;
