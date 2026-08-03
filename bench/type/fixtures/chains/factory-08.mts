import {
  brand,
  err,
  formatBenchmarkTypeError,
  ok,
  type TypeError,
} from "./api.mts";
import { T4 } from "./factory-04.mts";

interface E5 extends TypeError<"B5"> {
  readonly index: 5;
  readonly value: string;
}

const T5 = brand("B5", T4, (value) =>
  value.length >= 0 ? ok() : err<E5>({ type: "B5", index: 5, value }),
  formatBenchmarkTypeError,
);

interface E6 extends TypeError<"B6"> {
  readonly index: 6;
  readonly value: string;
}

const T6 = brand("B6", T5, (value) =>
  value.length >= 0 ? ok() : err<E6>({ type: "B6", index: 6, value }),
  formatBenchmarkTypeError,
);

interface E7 extends TypeError<"B7"> {
  readonly index: 7;
  readonly value: string;
}

const T7 = brand("B7", T6, (value) =>
  value.length >= 0 ? ok() : err<E7>({ type: "B7", index: 7, value }),
  formatBenchmarkTypeError,
);

interface E8 extends TypeError<"B8"> {
  readonly index: 8;
  readonly value: string;
}

export const T8 = /*#__PURE__*/ brand("B8", T7, (value) =>
  value.length >= 0 ? ok() : err<E8>({ type: "B8", index: 8, value }),
  formatBenchmarkTypeError,
);
