import { type InferErrors } from "./chains/api.mts";
import { S8 } from "./chains/semantic-08.mts";

export type Output = typeof S8.Output;
export type Errors = InferErrors<typeof S8>;

export type FromInput = Parameters<
  typeof S8.from
>[0];
export type FromResult = ReturnType<
  typeof S8.from
>;

export type From1Input = Parameters<
  typeof S8.from.parent
>[0];
export type From1Result = ReturnType<
  typeof S8.from.parent
>;

export type From2Input = Parameters<
  typeof S8.from.parent.parent
>[0];
export type From2Result = ReturnType<
  typeof S8.from.parent.parent
>;

export type From3Input = Parameters<
  typeof S8.from.parent.parent.parent
>[0];
export type From3Result = ReturnType<
  typeof S8.from.parent.parent.parent
>;

export type From4Input = Parameters<
  typeof S8.from.parent.parent.parent.parent
>[0];
export type From4Result = ReturnType<
  typeof S8.from.parent.parent.parent.parent
>;

export type From5Input = Parameters<
  typeof S8.from.parent.parent.parent.parent.parent
>[0];
export type From5Result = ReturnType<
  typeof S8.from.parent.parent.parent.parent.parent
>;

export type From6Input = Parameters<
  typeof S8.from.parent.parent.parent.parent.parent.parent
>[0];
export type From6Result = ReturnType<
  typeof S8.from.parent.parent.parent.parent.parent.parent
>;

export type From7Input = Parameters<
  typeof S8.from.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From7Result = ReturnType<
  typeof S8.from.parent.parent.parent.parent.parent.parent.parent
>;
export type From8Input = Parameters<
  typeof S8.from.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From8Result = ReturnType<
  typeof S8.from.parent.parent.parent.parent.parent.parent.parent.parent
>;
