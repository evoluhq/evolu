import { set, type InferErrors } from "./chains/api.mts";
import { T16 } from "./chains/factory-16.mts";

const S = set(T16);
void S;

export type Errors = InferErrors<typeof S>;
