import {
  brand,
  err,
  formatBenchmarkTypeError,
  ok,
  type TypeError,
} from "./api.mts";
import { T8 } from "./factory-08.mts";

interface E9 extends TypeError<"B9"> {
  readonly index: 9;
  readonly value: string;
}

const T9 = brand("B9", T8, (value) =>
  value.length >= 0 ? ok() : err<E9>({ type: "B9", index: 9, value }),
  formatBenchmarkTypeError,
);

interface E10 extends TypeError<"B10"> {
  readonly index: 10;
  readonly value: string;
}

const T10 = brand("B10", T9, (value) =>
  value.length >= 0 ? ok() : err<E10>({ type: "B10", index: 10, value }),
  formatBenchmarkTypeError,
);

interface E11 extends TypeError<"B11"> {
  readonly index: 11;
  readonly value: string;
}

const T11 = brand("B11", T10, (value) =>
  value.length >= 0 ? ok() : err<E11>({ type: "B11", index: 11, value }),
  formatBenchmarkTypeError,
);

interface E12 extends TypeError<"B12"> {
  readonly index: 12;
  readonly value: string;
}

const T12 = brand("B12", T11, (value) =>
  value.length >= 0 ? ok() : err<E12>({ type: "B12", index: 12, value }),
  formatBenchmarkTypeError,
);

interface E13 extends TypeError<"B13"> {
  readonly index: 13;
  readonly value: string;
}

const T13 = brand("B13", T12, (value) =>
  value.length >= 0 ? ok() : err<E13>({ type: "B13", index: 13, value }),
  formatBenchmarkTypeError,
);

interface E14 extends TypeError<"B14"> {
  readonly index: 14;
  readonly value: string;
}

const T14 = brand("B14", T13, (value) =>
  value.length >= 0 ? ok() : err<E14>({ type: "B14", index: 14, value }),
  formatBenchmarkTypeError,
);

interface E15 extends TypeError<"B15"> {
  readonly index: 15;
  readonly value: string;
}

const T15 = brand("B15", T14, (value) =>
  value.length >= 0 ? ok() : err<E15>({ type: "B15", index: 15, value }),
  formatBenchmarkTypeError,
);

interface E16 extends TypeError<"B16"> {
  readonly index: 16;
  readonly value: string;
}

export const T16 = /*#__PURE__*/ brand("B16", T15, (value) =>
  value.length >= 0 ? ok() : err<E16>({ type: "B16", index: 16, value }),
  formatBenchmarkTypeError,
);
