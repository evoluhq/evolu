import { type InferErrors } from "./chains/api.mts";
import { DU32 } from "./chains/discriminated-union-32.mts";

export type Input = typeof DU32.Input;
export type Output = typeof DU32.Output;
export type Errors = InferErrors<typeof DU32>;
export type NodeError = typeof DU32.Error;
export type FromUnknownInput = Parameters<typeof DU32.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof DU32.fromUnknown>;
export type FromInput = Parameters<typeof DU32.from>[0];
export type FromResult = ReturnType<typeof DU32.from>;
export type FromParentInput = Parameters<typeof DU32.from.parent>[0];
export type FromParentResult = ReturnType<typeof DU32.from.parent>;
export type ToInput = Parameters<typeof DU32.to>[0];
export type ToResult = ReturnType<typeof DU32.to>;
export type Key = typeof DU32.key;
export type Members = typeof DU32.members;
export type Parent = typeof DU32.parent;
