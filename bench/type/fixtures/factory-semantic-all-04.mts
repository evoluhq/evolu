import { type InferErrors } from "./chains/api.mts";
import { S4 } from "./chains/semantic-04.mts";

export type Output = typeof S4.Output;
export type Errors = InferErrors<typeof S4>;

export type FromInput = Parameters<
  typeof S4.from
>[0];
export type FromResult = ReturnType<
  typeof S4.from
>;

export type From1Input = Parameters<
  typeof S4.from.parent
>[0];
export type From1Result = ReturnType<
  typeof S4.from.parent
>;

export type From2Input = Parameters<
  typeof S4.from.parent.parent
>[0];
export type From2Result = ReturnType<
  typeof S4.from.parent.parent
>;

export type From3Input = Parameters<
  typeof S4.from.parent.parent.parent
>[0];
export type From3Result = ReturnType<
  typeof S4.from.parent.parent.parent
>;
export type From4Input = Parameters<
  typeof S4.from.parent.parent.parent.parent
>[0];
export type From4Result = ReturnType<
  typeof S4.from.parent.parent.parent.parent
>;
