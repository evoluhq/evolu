import { type InferErrors } from "./chains/api.mts";
import { T2 } from "./chains/factory-02.mts";

export type Errors = InferErrors<typeof T2>;
