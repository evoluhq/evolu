import { type InferErrors } from "./chains/api.mts";
import { DU8 } from "./chains/discriminated-union-08.mts";

export type Input = typeof DU8.Input;
export type Output = typeof DU8.Output;
export type Errors = InferErrors<typeof DU8>;
export type NodeError = typeof DU8.Error;
export type FromUnknownInput = Parameters<typeof DU8.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof DU8.fromUnknown>;
export type FromInput = Parameters<typeof DU8.from>[0];
export type FromResult = ReturnType<typeof DU8.from>;
export type FromParentInput = Parameters<typeof DU8.from.parent>[0];
export type FromParentResult = ReturnType<typeof DU8.from.parent>;
export type ToInput = Parameters<typeof DU8.to>[0];
export type ToResult = ReturnType<typeof DU8.to>;
export type Key = typeof DU8.key;
export type Members = typeof DU8.members;
export type Parent = typeof DU8.parent;
