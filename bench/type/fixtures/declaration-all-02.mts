import { type InferErrors } from "./chains/api.mts";
import type { T2 } from "./chains/declaration-02.mts";

export type Output = T2["Output"];
export type Errors = InferErrors<T2>;

export type FromInput = Parameters<T2["from"]>[0];
export type FromResult = ReturnType<T2["from"]>;

export type From1Input = Parameters<T2["from"]["parent"]>[0];
export type From1Result = ReturnType<T2["from"]["parent"]>;
export type From2Input = Parameters<T2["from"]["parent"]["parent"]>[0];
export type From2Result = ReturnType<T2["from"]["parent"]["parent"]>;
