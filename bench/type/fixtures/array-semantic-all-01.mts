import { array, type InferErrors } from "./chains/api.mts";
import { S1 } from "./chains/semantic-01.mts";

const A = array(S1);
void A;

export type Output = typeof A.Output;
export type Errors = InferErrors<typeof A>;
export type FromUnknownInput = Parameters<typeof A.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof A.fromUnknown>;

export type FromInput = Parameters<
  typeof A.from
>[0];
export type FromResult = ReturnType<
  typeof A.from
>;
export type From1Input = Parameters<
  typeof A.from.parent
>[0];
export type From1Result = ReturnType<
  typeof A.from.parent
>;
