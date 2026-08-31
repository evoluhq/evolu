import {
  String,
  templateLiteralParser,
} from "../../../../packages/common/src/Type.ts";

const Pixels = templateLiteralParser(String, "px");

export default (): ReadonlyArray<string> => {
  const parsed = Pixels.fromUnknown("10px");
  const invalid = Pixels.fromUnknown("10em");

  return [
    parsed.ok ? parsed.value[0] : Pixels.formatError(parsed.error),
    Pixels.to(["10"]),
    invalid.ok ? invalid.value[0] : Pixels.formatError(invalid.error),
  ];
};
