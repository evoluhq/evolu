import { set, type InferErrors } from "./chains/api.mts";
import { T4 } from "./chains/factory-04.mts";

const S = set(T4);
void S;

export type Errors = InferErrors<typeof S>;
