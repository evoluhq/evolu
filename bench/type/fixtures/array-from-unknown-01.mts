import { array } from "./chains/api.mts";
import { T1 } from "./chains/factory-01.mts";

const A = array(T1);
void A;

export type FromUnknownInput = Parameters<typeof A.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof A.fromUnknown>;
