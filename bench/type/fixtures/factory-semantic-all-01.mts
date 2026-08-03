import { type InferErrors } from "./chains/api.mts";
import { S1 } from "./chains/semantic-01.mts";

export type Output = typeof S1.Output;
export type Errors = InferErrors<typeof S1>;

export type FromInput = Parameters<
  typeof S1.from
>[0];
export type FromResult = ReturnType<
  typeof S1.from
>;
export type From1Input = Parameters<
  typeof S1.from.parent
>[0];
export type From1Result = ReturnType<
  typeof S1.from.parent
>;
