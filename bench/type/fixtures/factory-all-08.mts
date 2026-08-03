import { type InferErrors } from "./chains/api.mts";
import { T8 } from "./chains/factory-08.mts";

export type Output = typeof T8.Output;
export type Errors = InferErrors<typeof T8>;

export type FromInput = Parameters<typeof T8.from>[0];
export type FromResult = ReturnType<typeof T8.from>;

export type From1Input = Parameters<typeof T8.from.parent>[0];
export type From1Result = ReturnType<typeof T8.from.parent>;

export type From2Input = Parameters<typeof T8.from.parent.parent>[0];
export type From2Result = ReturnType<typeof T8.from.parent.parent>;

export type From3Input = Parameters<typeof T8.from.parent.parent.parent>[0];
export type From3Result = ReturnType<typeof T8.from.parent.parent.parent>;

export type From4Input = Parameters<
  typeof T8.from.parent.parent.parent.parent
>[0];
export type From4Result = ReturnType<
  typeof T8.from.parent.parent.parent.parent
>;

export type From5Input = Parameters<
  typeof T8.from.parent.parent.parent.parent.parent
>[0];
export type From5Result = ReturnType<
  typeof T8.from.parent.parent.parent.parent.parent
>;

export type From6Input = Parameters<
  typeof T8.from.parent.parent.parent.parent.parent.parent
>[0];
export type From6Result = ReturnType<
  typeof T8.from.parent.parent.parent.parent.parent.parent
>;

export type From7Input = Parameters<
  typeof T8.from.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From7Result = ReturnType<
  typeof T8.from.parent.parent.parent.parent.parent.parent.parent
>;
export type From8Input = Parameters<
  typeof T8.from.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From8Result = ReturnType<
  typeof T8.from.parent.parent.parent.parent.parent.parent.parent.parent
>;
