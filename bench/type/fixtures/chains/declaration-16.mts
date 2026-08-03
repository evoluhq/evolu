import { type BrandType, type TypeError } from "./api.mts";
import type { T8 } from "./declaration-08.mts";

interface E9 extends TypeError<"B9"> {
  readonly index: 9;
  readonly value: string;
}

type T9 = BrandType<T8, "B9", E9>;

interface E10 extends TypeError<"B10"> {
  readonly index: 10;
  readonly value: string;
}

type T10 = BrandType<T9, "B10", E10>;

interface E11 extends TypeError<"B11"> {
  readonly index: 11;
  readonly value: string;
}

type T11 = BrandType<T10, "B11", E11>;

interface E12 extends TypeError<"B12"> {
  readonly index: 12;
  readonly value: string;
}

type T12 = BrandType<T11, "B12", E12>;

interface E13 extends TypeError<"B13"> {
  readonly index: 13;
  readonly value: string;
}

type T13 = BrandType<T12, "B13", E13>;

interface E14 extends TypeError<"B14"> {
  readonly index: 14;
  readonly value: string;
}

type T14 = BrandType<T13, "B14", E14>;

interface E15 extends TypeError<"B15"> {
  readonly index: 15;
  readonly value: string;
}

type T15 = BrandType<T14, "B15", E15>;

interface E16 extends TypeError<"B16"> {
  readonly index: 16;
  readonly value: string;
}

export type T16 = BrandType<T15, "B16", E16>;
