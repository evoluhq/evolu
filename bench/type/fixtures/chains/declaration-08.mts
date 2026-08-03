import { type BrandType, type TypeError } from "./api.mts";
import type { T4 } from "./declaration-04.mts";

interface E5 extends TypeError<"B5"> {
  readonly index: 5;
  readonly value: string;
}

type T5 = BrandType<T4, "B5", E5>;

interface E6 extends TypeError<"B6"> {
  readonly index: 6;
  readonly value: string;
}

type T6 = BrandType<T5, "B6", E6>;

interface E7 extends TypeError<"B7"> {
  readonly index: 7;
  readonly value: string;
}

type T7 = BrandType<T6, "B7", E7>;

interface E8 extends TypeError<"B8"> {
  readonly index: 8;
  readonly value: string;
}

export type T8 = BrandType<T7, "B8", E8>;
