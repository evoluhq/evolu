import { type InferErrors } from "./chains/api.mts";
import { T2 } from "./chains/factory-02.mts";

export type Output = typeof T2.Output;
export type Errors = InferErrors<typeof T2>;

export type FromInput = Parameters<typeof T2.from>[0];
export type FromResult = ReturnType<typeof T2.from>;

export type From1Input = Parameters<typeof T2.from.parent>[0];
export type From1Result = ReturnType<typeof T2.from.parent>;
export type From2Input = Parameters<typeof T2.from.parent.parent>[0];
export type From2Result = ReturnType<typeof T2.from.parent.parent>;
