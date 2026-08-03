import {
  brand,
  err,
  formatBenchmarkTypeError,
  ok,
  type TypeError,
} from "./api.mts";
import { T0 } from "./root.mts";

interface E1 extends TypeError<"B1"> {
  readonly index: 1;
  readonly value: string;
}

export const T1 = /*#__PURE__*/ brand("B1", T0, (value) =>
  value.length >= 0 ? ok() : err<E1>({ type: "B1", index: 1, value }),
  formatBenchmarkTypeError,
);
