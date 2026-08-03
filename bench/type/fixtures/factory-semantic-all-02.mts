import { type InferErrors } from "./chains/api.mts";
import { S2 } from "./chains/semantic-02.mts";

export type Output = typeof S2.Output;
export type Errors = InferErrors<typeof S2>;

export type FromInput = Parameters<
  typeof S2.from
>[0];
export type FromResult = ReturnType<
  typeof S2.from
>;

export type From1Input = Parameters<
  typeof S2.from.parent
>[0];
export type From1Result = ReturnType<
  typeof S2.from.parent
>;
export type From2Input = Parameters<
  typeof S2.from.parent.parent
>[0];
export type From2Result = ReturnType<
  typeof S2.from.parent.parent
>;
