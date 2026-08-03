import {
  Number,
  record,
  String,
} from "../../../../../packages/common/src/Type2.ts";

const Values = record(String, Number);

const parse = (value: unknown): string | number => {
  const result = Values.fromUnknown(value);

  return result.ok
    ? (result.value.answer ?? -1)
    : Values.formatError(result.error);
};

export default (): ReadonlyArray<string | number | boolean> => {
  const input = { answer: 42 };
  const result = Values.fromUnknown(input);

  return [
    parse(null),
    parse({ answer: "x" }),
    result.ok ? (result.value.answer ?? -1) : -1,
    result.ok && result.value === input,
  ];
};
