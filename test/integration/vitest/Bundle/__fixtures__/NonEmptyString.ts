import {
  brand,
  String,
  type TypeValueError,
} from "../../../../../packages/common/src/Type.ts";
import { err, ok } from "../../../../../packages/common/src/Result.ts";

export interface NonEmptyStringError extends TypeValueError<"NonEmptyString"> {
  readonly value: string;
}

const NonEmptyString = /*#__PURE__*/ brand(
  "NonEmptyString",
  String,
  (value) =>
    value.length > 0
      ? ok()
      : err<NonEmptyStringError>({ type: "NonEmptyString", value }),
  () => "Enter some text.",
);

const parse = (value: unknown): string => {
  const result = NonEmptyString.fromUnknown(value);

  return result.ok ? result.value : NonEmptyString.formatError(result.error);
};

export default (): ReadonlyArray<string> => [parse(42), parse("")];
