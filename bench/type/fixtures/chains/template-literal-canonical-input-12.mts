import { templateLiteralParser } from "../../../../packages/common/src/Type.ts";
import { Bit } from "./template-literal-canonical-input-04.mts";
import { templateLiteralParts08 } from "./template-literal-canonical-input-08.mts";

export const templateLiteralParts12 = [
  ...templateLiteralParts08,
  Bit,
  Bit,
  Bit,
  Bit,
] as const;

export const TemplateLiteralCanonicalInput12 =
  /*#__PURE__*/ templateLiteralParser(...templateLiteralParts12);
