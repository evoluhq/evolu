import { array, type InferErrors } from "./chains/api.mts";
import { U32 } from "./chains/union-32.mts";

const _A = array(U32);

export type Output = typeof _A.Output;
export type Errors = InferErrors<typeof _A>;
export type FromUnknownResult = ReturnType<typeof _A.fromUnknown>;
export type FromResult = ReturnType<typeof _A.from>;
export type FromParentResult = ReturnType<typeof _A.from.parent>;
export type Parent = typeof _A.parent;
