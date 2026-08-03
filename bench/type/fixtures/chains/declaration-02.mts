import { type BrandType, type TypeError } from "./api.mts";
import type { T1 } from "./declaration-01.mts";

interface E2 extends TypeError<"B2"> {
  readonly index: 2;
  readonly value: string;
}

export type T2 = BrandType<T1, "B2", E2>;
