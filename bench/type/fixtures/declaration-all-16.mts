import { type InferErrors } from "./chains/api.mts";
import type { T16 } from "./chains/declaration-16.mts";

export type Output = T16["Output"];
export type Errors = InferErrors<T16>;

export type FromInput = Parameters<T16["from"]>[0];
export type FromResult = ReturnType<T16["from"]>;

export type From1Input = Parameters<T16["from"]["parent"]>[0];
export type From1Result = ReturnType<T16["from"]["parent"]>;

export type From2Input = Parameters<T16["from"]["parent"]["parent"]>[0];
export type From2Result = ReturnType<T16["from"]["parent"]["parent"]>;

export type From3Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]
>[0];
export type From3Result = ReturnType<T16["from"]["parent"]["parent"]["parent"]>;

export type From4Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From4Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]
>;

export type From5Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From5Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From6Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From6Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From7Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From7Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From8Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From8Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From9Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From9Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From10Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From10Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From11Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From11Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From12Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From12Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From13Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From13Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From14Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From14Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;

export type From15Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From15Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;
export type From16Input = Parameters<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>[0];
export type From16Result = ReturnType<
  T16["from"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]["parent"]
>;
