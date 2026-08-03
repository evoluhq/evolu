import { typed } from "../../../../../packages/common/src/Type2.ts";

const Pending = typed("Pending");

const parse = (value: unknown): string => {
  const result = Pending.fromUnknown(value);

  return result.ok ? result.value.type : Pending.formatError(result.error);
};

export default (): ReadonlyArray<string> => [
  parse(null),
  parse({}),
  parse({ type: 42 }),
  parse({ type: "Other" }),
  parse({ type: "Pending", extra: true }),
  parse({ type: "Pending" }),
];
