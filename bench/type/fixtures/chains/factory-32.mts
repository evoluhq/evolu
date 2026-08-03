import {
  brand,
  err,
  formatBenchmarkTypeError,
  ok,
  type TypeError,
} from "./api.mts";
import { T16 } from "./factory-16.mts";

interface E17 extends TypeError<"B17"> {
  readonly index: 17;
  readonly value: string;
}

const T17 = brand("B17", T16, (value) =>
  value.length >= 0 ? ok() : err<E17>({ type: "B17", index: 17, value }),
  formatBenchmarkTypeError,
);

interface E18 extends TypeError<"B18"> {
  readonly index: 18;
  readonly value: string;
}

const T18 = brand("B18", T17, (value) =>
  value.length >= 0 ? ok() : err<E18>({ type: "B18", index: 18, value }),
  formatBenchmarkTypeError,
);

interface E19 extends TypeError<"B19"> {
  readonly index: 19;
  readonly value: string;
}

const T19 = brand("B19", T18, (value) =>
  value.length >= 0 ? ok() : err<E19>({ type: "B19", index: 19, value }),
  formatBenchmarkTypeError,
);

interface E20 extends TypeError<"B20"> {
  readonly index: 20;
  readonly value: string;
}

const T20 = brand("B20", T19, (value) =>
  value.length >= 0 ? ok() : err<E20>({ type: "B20", index: 20, value }),
  formatBenchmarkTypeError,
);

interface E21 extends TypeError<"B21"> {
  readonly index: 21;
  readonly value: string;
}

const T21 = brand("B21", T20, (value) =>
  value.length >= 0 ? ok() : err<E21>({ type: "B21", index: 21, value }),
  formatBenchmarkTypeError,
);

interface E22 extends TypeError<"B22"> {
  readonly index: 22;
  readonly value: string;
}

const T22 = brand("B22", T21, (value) =>
  value.length >= 0 ? ok() : err<E22>({ type: "B22", index: 22, value }),
  formatBenchmarkTypeError,
);

interface E23 extends TypeError<"B23"> {
  readonly index: 23;
  readonly value: string;
}

const T23 = brand("B23", T22, (value) =>
  value.length >= 0 ? ok() : err<E23>({ type: "B23", index: 23, value }),
  formatBenchmarkTypeError,
);

interface E24 extends TypeError<"B24"> {
  readonly index: 24;
  readonly value: string;
}

const T24 = brand("B24", T23, (value) =>
  value.length >= 0 ? ok() : err<E24>({ type: "B24", index: 24, value }),
  formatBenchmarkTypeError,
);

interface E25 extends TypeError<"B25"> {
  readonly index: 25;
  readonly value: string;
}

const T25 = brand("B25", T24, (value) =>
  value.length >= 0 ? ok() : err<E25>({ type: "B25", index: 25, value }),
  formatBenchmarkTypeError,
);

interface E26 extends TypeError<"B26"> {
  readonly index: 26;
  readonly value: string;
}

const T26 = brand("B26", T25, (value) =>
  value.length >= 0 ? ok() : err<E26>({ type: "B26", index: 26, value }),
  formatBenchmarkTypeError,
);

interface E27 extends TypeError<"B27"> {
  readonly index: 27;
  readonly value: string;
}

const T27 = brand("B27", T26, (value) =>
  value.length >= 0 ? ok() : err<E27>({ type: "B27", index: 27, value }),
  formatBenchmarkTypeError,
);

interface E28 extends TypeError<"B28"> {
  readonly index: 28;
  readonly value: string;
}

const T28 = brand("B28", T27, (value) =>
  value.length >= 0 ? ok() : err<E28>({ type: "B28", index: 28, value }),
  formatBenchmarkTypeError,
);

interface E29 extends TypeError<"B29"> {
  readonly index: 29;
  readonly value: string;
}

const T29 = brand("B29", T28, (value) =>
  value.length >= 0 ? ok() : err<E29>({ type: "B29", index: 29, value }),
  formatBenchmarkTypeError,
);

interface E30 extends TypeError<"B30"> {
  readonly index: 30;
  readonly value: string;
}

const T30 = brand("B30", T29, (value) =>
  value.length >= 0 ? ok() : err<E30>({ type: "B30", index: 30, value }),
  formatBenchmarkTypeError,
);

interface E31 extends TypeError<"B31"> {
  readonly index: 31;
  readonly value: string;
}

const T31 = brand("B31", T30, (value) =>
  value.length >= 0 ? ok() : err<E31>({ type: "B31", index: 31, value }),
  formatBenchmarkTypeError,
);

interface E32 extends TypeError<"B32"> {
  readonly index: 32;
  readonly value: string;
}

export const T32 = /*#__PURE__*/ brand("B32", T31, (value) =>
  value.length >= 0 ? ok() : err<E32>({ type: "B32", index: 32, value }),
  formatBenchmarkTypeError,
);
