import { type InferErrors } from "./chains/api.mts";
import { AC2 } from "./chains/array-child-02.mts";

export type Input = typeof AC2.Input;
export type Output = typeof AC2.Output;
export type Errors = InferErrors<typeof AC2>;
export type FromUnknownInput = Parameters<typeof AC2.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof AC2.fromUnknown>;
export type FromInput = Parameters<typeof AC2.from>[0];
export type FromResult = ReturnType<typeof AC2.from>;
export type From1Input = Parameters<typeof AC2.from.parent>[0];
export type From1Result = ReturnType<typeof AC2.from.parent>;
export type From2Input = Parameters<typeof AC2.from.parent.parent>[0];
export type From2Result = ReturnType<typeof AC2.from.parent.parent>;
export type From3Input = Parameters<typeof AC2.from.parent.parent.parent>[0];
export type From3Result = ReturnType<typeof AC2.from.parent.parent.parent>;
export type From4Input = Parameters<
  typeof AC2.from.parent.parent.parent.parent
>[0];
export type From4Result = ReturnType<
  typeof AC2.from.parent.parent.parent.parent
>;
export type From5Input = Parameters<
  typeof AC2.from.parent.parent.parent.parent.parent
>[0];
export type From5Result = ReturnType<
  typeof AC2.from.parent.parent.parent.parent.parent
>;
export type From6Input = Parameters<
  typeof AC2.from.parent.parent.parent.parent.parent.parent
>[0];
export type From6Result = ReturnType<
  typeof AC2.from.parent.parent.parent.parent.parent.parent
>;
export type ToInput = Parameters<typeof AC2.to>[0];
export type ToResult = ReturnType<typeof AC2.to>;
export type Parent = typeof AC2.parent;
