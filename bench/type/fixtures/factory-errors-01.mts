import { type InferErrors } from "./chains/api.mts";
import { T1 } from "./chains/factory-01.mts";

export type Errors = InferErrors<typeof T1>;
