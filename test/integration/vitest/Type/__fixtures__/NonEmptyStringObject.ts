import {
  brand,
  object,
  String,
} from "../../../../../packages/common/src/Type.ts";
import { err, ok } from "../../../../../packages/common/src/Result.ts";

const NonEmptyString = /*#__PURE__*/ brand(
  "NonEmptyString",
  String,
  (value) => (value.length > 0 ? ok() : err({ type: "NonEmptyString", value })),
  () => "Enter some text.",
);

const Value = object({ value: NonEmptyString });

const parse = (value: unknown): string => {
  const result = Value.fromUnknown(value);

  return result.ok ? result.value.value : Value.formatError(result.error);
};

export default (): ReadonlyArray<string> => [
  parse(null),
  parse({}),
  parse({ value: 42 }),
  parse({ value: "" }),
];
