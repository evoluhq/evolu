import { type BrandType, type TypeError } from "./api.mts";
import type { T2 } from "./declaration-02.mts";

interface E3 extends TypeError<"B3"> {
  readonly index: 3;
  readonly value: string;
}

type T3 = BrandType<T2, "B3", E3>;

interface E4 extends TypeError<"B4"> {
  readonly index: 4;
  readonly value: string;
}

export type T4 = BrandType<T3, "B4", E4>;
