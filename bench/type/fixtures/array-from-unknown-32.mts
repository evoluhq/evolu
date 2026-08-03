import { array } from "./chains/api.mts";
import { T32 } from "./chains/factory-32.mts";

const A = array(T32);
void A;

export type FromUnknownInput = Parameters<typeof A.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof A.fromUnknown>;
