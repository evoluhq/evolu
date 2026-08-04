import { set, type InferErrors } from "./chains/api.mts";
import { T1 } from "./chains/factory-01.mts";

const S = set(T1);
void S;

export type Errors = InferErrors<typeof S>;
