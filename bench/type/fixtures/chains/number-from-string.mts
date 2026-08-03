import {
  brand,
  err,
  formatBenchmarkTypeError,
  ok,
  String,
  transform,
  type TypeError,
} from "./api.mts";
import { Number } from "../../../../packages/common/src/Type2.ts";

export interface NumberFromStringError
  extends TypeError<"NumberFromString"> {
  readonly value: string;
}

export const NumberFromString = /*#__PURE__*/ transform(
  "NumberFromString",
  String,
  Number,
  {
    from: (value) => {
      const number = globalThis.Number(value);
      return globalThis.Number.isFinite(number)
        ? ok(number)
        : err<NumberFromStringError>({
            type: "NumberFromString",
            value,
          });
    },
    to: (value) => globalThis.String(value),
  },
  formatBenchmarkTypeError,
);

export interface PositiveError extends TypeError<"Positive"> {
  readonly value: number;
}

export const Positive = /*#__PURE__*/ brand(
  "Positive",
  Number,
  (value) =>
    value > 0
      ? ok()
      : err<PositiveError>({ type: "Positive", value }),
  formatBenchmarkTypeError,
);
