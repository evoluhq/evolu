import { type InferErrors } from "./chains/api.mts";
import { OU2 } from "./chains/object-union-02.mts";

export type Input = typeof OU2.Input;
export type Output = typeof OU2.Output;
export type Errors = InferErrors<typeof OU2>;
export type FromUnknownInput = Parameters<typeof OU2.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof OU2.fromUnknown>;
export type FromInput = Parameters<typeof OU2.from>[0];
export type FromResult = ReturnType<typeof OU2.from>;
export type FromParentInput = Parameters<typeof OU2.from.parent>[0];
export type FromParentResult = ReturnType<typeof OU2.from.parent>;
export type ToInput = Parameters<typeof OU2.to>[0];
export type ToResult = ReturnType<typeof OU2.to>;
export type Members = typeof OU2.members;
export type Parent = typeof OU2.parent;
