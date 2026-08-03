import {
  brand,
  err,
  formatBenchmarkTypeError,
  ok,
  type TypeError,
} from "./api.mts";
import { T1 } from "./factory-01.mts";

interface E2 extends TypeError<"B2"> {
  readonly index: 2;
  readonly value: string;
}

export const T2 = /*#__PURE__*/ brand("B2", T1, (value) =>
  value.length >= 0 ? ok() : err<E2>({ type: "B2", index: 2, value }),
  formatBenchmarkTypeError,
);
