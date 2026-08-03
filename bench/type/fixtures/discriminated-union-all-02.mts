import { type InferErrors } from "./chains/api.mts";
import { DU2 } from "./chains/discriminated-union-02.mts";

export type Input = typeof DU2.Input;
export type Output = typeof DU2.Output;
export type Errors = InferErrors<typeof DU2>;
export type NodeError = typeof DU2.Error;
export type FromUnknownInput = Parameters<typeof DU2.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof DU2.fromUnknown>;
export type FromInput = Parameters<typeof DU2.from>[0];
export type FromResult = ReturnType<typeof DU2.from>;
export type FromParentInput = Parameters<typeof DU2.from.parent>[0];
export type FromParentResult = ReturnType<typeof DU2.from.parent>;
export type ToInput = Parameters<typeof DU2.to>[0];
export type ToResult = ReturnType<typeof DU2.to>;
export type Key = typeof DU2.key;
export type Members = typeof DU2.members;
export type Parent = typeof DU2.parent;
