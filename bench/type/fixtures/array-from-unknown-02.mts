import { array } from "./chains/api.mts";
import { T2 } from "./chains/factory-02.mts";

const A = array(T2);
void A;

export type FromUnknownInput = Parameters<typeof A.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof A.fromUnknown>;
