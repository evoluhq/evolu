import { array, type InferErrors } from "./chains/api.mts";
import { S16 } from "./chains/semantic-16.mts";

const A = array(S16);
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

export type From5Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent
>[0];
export type From5Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent
>;

export type From6Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent.parent
>[0];
export type From6Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent.parent
>;

export type From7Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From7Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent
>;

export type From8Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From8Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From9Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From9Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From10Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From10Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From11Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From11Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From12Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From12Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From13Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From13Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From14Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From14Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From15Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From15Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;
export type From16Input = Parameters<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From16Result = ReturnType<
  typeof A.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;
