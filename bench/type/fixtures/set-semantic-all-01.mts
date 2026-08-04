import { set, type InferErrors } from "./chains/api.mts";
import { S1 } from "./chains/semantic-01.mts";

const S = set(S1);
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
