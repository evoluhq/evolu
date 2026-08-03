import { array } from "./chains/api.mts";
import { T4 } from "./chains/factory-04.mts";

const A = array(T4);
void A;

export type FromUnknownInput = Parameters<typeof A.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof A.fromUnknown>;
