import { type InferErrors } from "./chains/api.mts";
import { N4 } from "./chains/nested-set-04.mts";

export type Output = typeof N4.Output;
export type Errors = InferErrors<typeof N4>;
export type FromUnknownInput = Parameters<typeof N4.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof N4.fromUnknown>;
export type FromInput = Parameters<typeof N4.from>[0];
export type FromResult = ReturnType<typeof N4.from>;
