import { type InferErrors } from "./chains/api.mts";
import { DU16 } from "./chains/discriminated-union-16.mts";

export type Input = typeof DU16.Input;
export type Output = typeof DU16.Output;
export type Errors = InferErrors<typeof DU16>;
export type NodeError = typeof DU16.Error;
export type FromUnknownInput = Parameters<typeof DU16.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof DU16.fromUnknown>;
export type FromInput = Parameters<typeof DU16.from>[0];
export type FromResult = ReturnType<typeof DU16.from>;
export type FromParentInput = Parameters<typeof DU16.from.parent>[0];
export type FromParentResult = ReturnType<typeof DU16.from.parent>;
export type ToInput = Parameters<typeof DU16.to>[0];
export type ToResult = ReturnType<typeof DU16.to>;
export type Key = typeof DU16.key;
export type Members = typeof DU16.members;
export type Parent = typeof DU16.parent;
