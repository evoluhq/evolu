import { type InferErrors } from "./chains/api.mts";
import { DU4 } from "./chains/discriminated-union-04.mts";

export type Input = typeof DU4.Input;
export type Output = typeof DU4.Output;
export type Errors = InferErrors<typeof DU4>;
export type NodeError = typeof DU4.Error;
export type FromUnknownInput = Parameters<typeof DU4.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof DU4.fromUnknown>;
export type FromInput = Parameters<typeof DU4.from>[0];
export type FromResult = ReturnType<typeof DU4.from>;
export type FromParentInput = Parameters<typeof DU4.from.parent>[0];
export type FromParentResult = ReturnType<typeof DU4.from.parent>;
export type ToInput = Parameters<typeof DU4.to>[0];
export type ToResult = ReturnType<typeof DU4.to>;
export type Key = typeof DU4.key;
export type Members = typeof DU4.members;
export type Parent = typeof DU4.parent;
