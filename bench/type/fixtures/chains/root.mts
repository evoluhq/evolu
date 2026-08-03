import {
  createType,
  err,
  formatBenchmarkTypeError,
  ok,
  type TypeError,
} from "./api.mts";

export interface E0 extends TypeError<"E0"> {
  readonly index: 0;
  readonly value: unknown;
}

export const T0 = /*#__PURE__*/ createType(
  "Root",
  (value) =>
    typeof value === "string"
      ? ok(value)
      : err<E0>({ type: "E0", index: 0, value }),
  formatBenchmarkTypeError,
);
