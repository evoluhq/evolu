import {
  Bit,
  templateLiteralParts04,
} from "./template-literal-canonical-input-04.mts";
import { templateLiteralParser } from "../../../../packages/common/src/Type.ts";

export const templateLiteralParts08 = [
  ...templateLiteralParts04,
  Bit,
  Bit,
  Bit,
  Bit,
] as const;

export const TemplateLiteralCanonicalInput08 =
  /*#__PURE__*/ templateLiteralParser(...templateLiteralParts08);
