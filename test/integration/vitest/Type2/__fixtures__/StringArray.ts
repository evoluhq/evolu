import {
  array,
  String,
} from "../../../../../packages/common/src/Type2.ts";

const Strings = array(String);

const parse = (value: unknown): string => {
  const result = Strings.fromUnknown(value);

  return result.ok ? result.value.join(",") : Strings.formatError(result.error);
};

export default (): ReadonlyArray<string> => [parse(null), parse([42])];
