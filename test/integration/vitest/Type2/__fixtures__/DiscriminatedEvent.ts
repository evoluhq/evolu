import {
  discriminatedUnion,
  String,
  typed,
} from "../../../../../packages/common/src/Type2.ts";

const Created = typed("Created", { value: String });
const Deleted = typed("Deleted", { value: String });
const Event = discriminatedUnion(Created, Deleted);

const parse = (value: unknown): string => {
  const result = Event.fromUnknown(value);

  return result.ok ? result.value.type : Event.formatError(result.error);
};

export default (): ReadonlyArray<string> => [
  parse(null),
  parse({ type: "Other", value: "value" }),
  parse({ type: "Created" }),
  parse({ type: "Created", value: "value" }),
  parse({ type: "Deleted", value: "value" }),
];
