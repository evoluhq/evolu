import {
  Number,
  String,
  union,
} from "../../../../../packages/common/src/Type.ts";

const StringOrNumber = union(String, Number);

export default (): ReadonlyArray<string | number> => {
  const invalid = StringOrNumber.fromUnknown(true);
  const encoded = StringOrNumber.parent.fromUnknown("value");

  return [
    invalid.ok ? invalid.value : StringOrNumber.formatError(invalid.error),
    encoded.ok
      ? encoded.value
      : StringOrNumber.parent.formatError(encoded.error),
  ];
};
