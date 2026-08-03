import { type InferErrors } from "./chains/api.mts";
import { T1 } from "./chains/factory-01.mts";

export type Output = typeof T1.Output;
export type Errors = InferErrors<typeof T1>;

export type FromInput = Parameters<typeof T1.from>[0];
export type FromResult = ReturnType<typeof T1.from>;
export type From1Input = Parameters<typeof T1.from.parent>[0];
export type From1Result = ReturnType<typeof T1.from.parent>;
