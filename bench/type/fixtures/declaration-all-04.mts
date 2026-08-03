import { type InferErrors } from "./chains/api.mts";
import type { T4 } from "./chains/declaration-04.mts";

export type Output = T4["Output"];
export type Errors = InferErrors<T4>;

export type FromInput = Parameters<T4["from"]>[0];
export type FromResult = ReturnType<T4["from"]>;

export type From1Input = Parameters<T4["from"]["parent"]>[0];
export type From1Result = ReturnType<T4["from"]["parent"]>;

export type From2Input = Parameters<T4["from"]["parent"]["parent"]>[0];
export type From2Result = ReturnType<T4["from"]["parent"]["parent"]>;

export type From3Input = Parameters<
  T4["from"]["parent"]["parent"]["parent"]
>[0];
export type From3Result = ReturnType<T4["from"]["parent"]["parent"]["parent"]>;
export type From4Input = Parameters<
  T4["from"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From4Result = ReturnType<
  T4["from"]["parent"]["parent"]["parent"]["parent"]
>;
