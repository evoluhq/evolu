import { map, Number, String } from "../../../../packages/common/src/Type.ts";

const Values = map(String, Number);

const parse = (value: unknown): string | number => {
  const result = Values.fromUnknown(value);

  return result.ok
    ? (result.value.get("answer") ?? -1)
    : Values.formatError(result.error);
};

export default (): ReadonlyArray<string | number | boolean> => {
  const input = new Map([["answer", 42]]);
  const result = Values.fromUnknown(input);

  return [
    parse(null),
    parse(new Map([["answer", "x"]])),
    result.ok ? (result.value.get("answer") ?? -1) : -1,
    result.ok && result.value === input,
  ];
};
