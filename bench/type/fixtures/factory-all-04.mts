import { type InferErrors } from "./chains/api.mts";
import { T4 } from "./chains/factory-04.mts";

export type Output = typeof T4.Output;
export type Errors = InferErrors<typeof T4>;

export type FromInput = Parameters<typeof T4.from>[0];
export type FromResult = ReturnType<typeof T4.from>;

export type From1Input = Parameters<typeof T4.from.parent>[0];
export type From1Result = ReturnType<typeof T4.from.parent>;

export type From2Input = Parameters<typeof T4.from.parent.parent>[0];
export type From2Result = ReturnType<typeof T4.from.parent.parent>;

export type From3Input = Parameters<typeof T4.from.parent.parent.parent>[0];
export type From3Result = ReturnType<typeof T4.from.parent.parent.parent>;
export type From4Input = Parameters<
  typeof T4.from.parent.parent.parent.parent
>[0];
export type From4Result = ReturnType<
  typeof T4.from.parent.parent.parent.parent
>;
