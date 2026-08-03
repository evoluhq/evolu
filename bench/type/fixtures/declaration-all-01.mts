import { type InferErrors } from "./chains/api.mts";
import type { T1 } from "./chains/declaration-01.mts";

export type Output = T1["Output"];
export type Errors = InferErrors<T1>;

export type FromInput = Parameters<T1["from"]>[0];
export type FromResult = ReturnType<T1["from"]>;
export type From1Input = Parameters<T1["from"]["parent"]>[0];
export type From1Result = ReturnType<T1["from"]["parent"]>;
