import { type InferErrors } from "./chains/api.mts";
import { N16 } from "./chains/nested-array-16.mts";

export type Output = typeof N16.Output;
export type Errors = InferErrors<typeof N16>;
export type FromUnknownInput = Parameters<typeof N16.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof N16.fromUnknown>;
export type FromInput = Parameters<typeof N16.from>[0];
export type FromResult = ReturnType<typeof N16.from>;
