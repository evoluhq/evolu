import { type InferErrors } from "./chains/api.mts";
import { N32 } from "./chains/nested-array-32.mts";

export type Output = typeof N32.Output;
export type Errors = InferErrors<typeof N32>;
export type FromUnknownInput = Parameters<typeof N32.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof N32.fromUnknown>;
export type FromInput = Parameters<typeof N32.from>[0];
export type FromResult = ReturnType<typeof N32.from>;
