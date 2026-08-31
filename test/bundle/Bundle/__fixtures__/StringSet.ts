import { set, String } from "../../../../packages/common/src/Type.ts";

const Strings = set(String);

const parse = (value: unknown): string => {
  const result = Strings.fromUnknown(value);

  return result.ok
    ? Array.from(result.value).join(",")
    : Strings.formatError(result.error);
};

export default (): ReadonlyArray<string> => [parse(null), parse(new Set([42]))];
