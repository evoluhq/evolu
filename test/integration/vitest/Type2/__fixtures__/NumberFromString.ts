import {
  Number,
  String,
  transform,
  type TypeValueError,
} from "../../../../../packages/common/src/Type2.ts";
import {
  err,
  ok,
  type Result,
} from "../../../../../packages/common/src/Result.ts";

interface NumberFromStringError
  extends TypeValueError<"NumberFromString"> {
  readonly value: string;
}

const NumberFromString = /*#__PURE__*/ transform(
  "NumberFromString",
  String,
  Number,
  {
    from: (value): Result<number, NumberFromStringError> => {
      const number = globalThis.Number(value);

      return value === "NaN"
        ? ok(globalThis.Number.NaN)
        : value !== "" && !globalThis.Number.isNaN(number)
          ? ok(number)
          : err<NumberFromStringError>({
              type: "NumberFromString",
              value,
            });
    },
    to: (value) =>
      globalThis.Object.is(value, -0) ? "-0" : globalThis.String(value),
  },
  () => "Enter a number.",
);

export default (): ReadonlyArray<string | number> => {
  const parsed = NumberFromString.fromUnknown("42");
  const encoded = NumberFromString.to(42);
  const invalidFrom = NumberFromString.from.parent("no");

  return [
    parsed.ok ? parsed.value : NumberFromString.formatError(parsed.error),
    encoded,
    invalidFrom.ok
      ? invalidFrom.value
      : NumberFromString.formatError(invalidFrom.error),
    NumberFromString.to(1.5),
  ];
};
