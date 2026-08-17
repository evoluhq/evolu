import { templateLiteralParser } from "../../../../packages/common/src/Type.ts";
import { Bit } from "./template-literal-canonical-input-04.mts";
import { templateLiteralParts12 } from "./template-literal-canonical-input-12.mts";

export const templateLiteralParts16 = [
  ...templateLiteralParts12,
  Bit,
  Bit,
  Bit,
  Bit,
] as const;

export const TemplateLiteralCanonicalInput16 =
  /*#__PURE__*/ templateLiteralParser(...templateLiteralParts16);
