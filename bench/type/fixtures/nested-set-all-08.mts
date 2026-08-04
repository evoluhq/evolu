import { type InferErrors } from "./chains/api.mts";
import { N8 } from "./chains/nested-set-08.mts";

export type Output = typeof N8.Output;
export type Errors = InferErrors<typeof N8>;
export type FromUnknownInput = Parameters<typeof N8.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof N8.fromUnknown>;
export type FromInput = Parameters<typeof N8.from>[0];
export type FromResult = ReturnType<typeof N8.from>;
