import { set, type InferErrors } from "./chains/api.mts";
import { T2 } from "./chains/factory-02.mts";

const S = set(T2);
void S;

export type Errors = InferErrors<typeof S>;
