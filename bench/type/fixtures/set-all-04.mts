import { set, type InferErrors } from "./chains/api.mts";
import { T4 } from "./chains/factory-04.mts";

const S = set(T4);
void S;

export type Output = typeof S.Output;
export type Errors = InferErrors<typeof S>;
export type FromUnknownInput = Parameters<typeof S.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof S.fromUnknown>;

export type FromInput = Parameters<
  typeof S.from
>[0];
export type FromResult = ReturnType<
  typeof S.from
>;

export type From1Input = Parameters<
  typeof S.from.parent
>[0];
export type From1Result = ReturnType<
  typeof S.from.parent
>;

export type From2Input = Parameters<
  typeof S.from.parent.parent
>[0];
export type From2Result = ReturnType<
  typeof S.from.parent.parent
>;

export type From3Input = Parameters<
  typeof S.from.parent.parent.parent
>[0];
export type From3Result = ReturnType<
  typeof S.from.parent.parent.parent
>;
export type From4Input = Parameters<
  typeof S.from.parent.parent.parent.parent
>[0];
export type From4Result = ReturnType<
  typeof S.from.parent.parent.parent.parent
>;
