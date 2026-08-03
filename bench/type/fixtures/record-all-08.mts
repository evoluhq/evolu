import { record, String, type InferErrors } from "./chains/api.mts";
import { T8 } from "./chains/factory-08.mts";

const R = record(String, T8);
void R;

export type Input = typeof R.Input;
export type Output = typeof R.Output;
export type Errors = InferErrors<typeof R>;
export type NodeError = typeof R.Error;
export type Parent = typeof R.parent;
export type FromUnknownResult = ReturnType<typeof R.fromUnknown>;
export type FromResult = ReturnType<typeof R.from>;
export type FromParentResult = ReturnType<typeof R.from.parent>;
export type ToResult = ReturnType<typeof R.to>;
