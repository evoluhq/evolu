import { type InferErrors } from "./chains/api.mts";
import { OU4 } from "./chains/object-union-04.mts";

export type Input = typeof OU4.Input;
export type Output = typeof OU4.Output;
export type Errors = InferErrors<typeof OU4>;
export type FromUnknownInput = Parameters<typeof OU4.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof OU4.fromUnknown>;
export type FromInput = Parameters<typeof OU4.from>[0];
export type FromResult = ReturnType<typeof OU4.from>;
export type FromParentInput = Parameters<typeof OU4.from.parent>[0];
export type FromParentResult = ReturnType<typeof OU4.from.parent>;
export type ToInput = Parameters<typeof OU4.to>[0];
export type ToResult = ReturnType<typeof OU4.to>;
export type Members = typeof OU4.members;
export type Parent = typeof OU4.parent;
