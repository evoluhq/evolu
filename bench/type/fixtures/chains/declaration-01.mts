import { type BrandType, type TypeError } from "./api.mts";
import { T0 } from "./root.mts";

interface E1 extends TypeError<"B1"> {
  readonly index: 1;
  readonly value: string;
}

export type T1 = BrandType<typeof T0, "B1", E1>;
