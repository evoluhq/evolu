import {
  brand,
  err,
  formatBenchmarkTypeError,
  ok,
  type TypeError,
} from "./api.mts";
import { T2 } from "./factory-02.mts";

interface E3 extends TypeError<"B3"> {
  readonly index: 3;
  readonly value: string;
}

const T3 = brand("B3", T2, (value) =>
  value.length >= 0 ? ok() : err<E3>({ type: "B3", index: 3, value }),
  formatBenchmarkTypeError,
);

interface E4 extends TypeError<"B4"> {
  readonly index: 4;
  readonly value: string;
}

export const T4 = /*#__PURE__*/ brand("B4", T3, (value) =>
  value.length >= 0 ? ok() : err<E4>({ type: "B4", index: 4, value }),
  formatBenchmarkTypeError,
);
