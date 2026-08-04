import { type InferErrors } from "./chains/api.mts";
import { N2 } from "./chains/nested-set-02.mts";

export type Output = typeof N2.Output;
export type Errors = InferErrors<typeof N2>;
export type FromUnknownInput = Parameters<typeof N2.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof N2.fromUnknown>;
export type FromInput = Parameters<typeof N2.from>[0];
export type FromResult = ReturnType<typeof N2.from>;
