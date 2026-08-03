import {
  Number,
  String,
  tuple,
} from "../../../../../packages/common/src/Type2.ts";

const Pair = tuple(String, Number);

const parse = (value: unknown): string => {
  const result = Pair.fromUnknown(value);

  return result.ok
    ? `${result.value[0]}:${result.value[1]}`
    : Pair.formatError(result.error);
};

export default (): ReadonlyArray<string> => [
  parse(null),
  parse([42, 1]),
  parse(["count", "1"]),
  parse(["count", 1]),
];
