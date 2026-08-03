import { array, type InferErrors } from "./chains/api.mts";
import { T4 } from "./chains/factory-04.mts";

const A = array(T4);
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

export type From2Input = Parameters<
  typeof A.from.parent.parent
>[0];
export type From2Result = ReturnType<
  typeof A.from.parent.parent
>;

export type From3Input = Parameters<
  typeof A.from.parent.parent.parent
>[0];
export type From3Result = ReturnType<
  typeof A.from.parent.parent.parent
>;
export type From4Input = Parameters<
  typeof A.from.parent.parent.parent.parent
>[0];
export type From4Result = ReturnType<
  typeof A.from.parent.parent.parent.parent
>;
