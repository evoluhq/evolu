import { type InferErrors } from "./chains/api.mts";
import { N1 } from "./chains/nested-set-01.mts";

export type Output = typeof N1.Output;
export type Errors = InferErrors<typeof N1>;
export type FromUnknownInput = Parameters<typeof N1.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof N1.fromUnknown>;
export type FromInput = Parameters<typeof N1.from>[0];
export type FromResult = ReturnType<typeof N1.from>;
