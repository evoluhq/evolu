import { type InferErrors } from "./chains/api.mts";
import type { T8 } from "./chains/declaration-08.mts";

export type Output = T8["Output"];
export type Errors = InferErrors<T8>;

export type FromInput = Parameters<T8["from"]>[0];
export type FromResult = ReturnType<T8["from"]>;

export type From1Input = Parameters<T8["from"]["parent"]>[0];
export type From1Result = ReturnType<T8["from"]["parent"]>;

export type From2Input = Parameters<T8["from"]["parent"]["parent"]>[0];
export type From2Result = ReturnType<T8["from"]["parent"]["parent"]>;

export type From3Input = Parameters<
  T8["from"]["parent"]["parent"]["parent"]
>[0];
export type From3Result = ReturnType<T8["from"]["parent"]["parent"]["parent"]>;

export type From4Input = Parameters<
  T8["from"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From4Result = ReturnType<
  T8["from"]["parent"]["parent"]["parent"]["parent"]
>;

export type From5Input = Parameters<
  T8["from"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From5Result = ReturnType<
  T8["from"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From6Input = Parameters<
  T8["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From6Result = ReturnType<
  T8["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From7Input = Parameters<
  T8["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From7Result = ReturnType<
  T8["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;
export type From8Input = Parameters<
  T8["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From8Result = ReturnType<
  T8["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;
