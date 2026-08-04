import { set, type InferErrors } from "./chains/api.mts";
import { T32 } from "./chains/factory-32.mts";

const S = set(T32);
void S;

export type Errors = InferErrors<typeof S>;
