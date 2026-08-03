import { array } from "./chains/api.mts";
import { T8 } from "./chains/factory-08.mts";

const A = array(T8);
void A;

export type FromUnknownInput = Parameters<typeof A.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof A.fromUnknown>;
