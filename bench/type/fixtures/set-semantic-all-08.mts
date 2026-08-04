import { set, type InferErrors } from "./chains/api.mts";
import { S8 } from "./chains/semantic-08.mts";

const S = set(S8);
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

export type From5Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent
>[0];
export type From5Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent
>;

export type From6Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent
>[0];
export type From6Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent
>;

export type From7Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From7Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent
>;
export type From8Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From8Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent
>;
