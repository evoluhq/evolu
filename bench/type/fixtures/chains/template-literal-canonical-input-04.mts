import {
  templateLiteralParser,
  union,
} from "../../../../packages/common/src/Type.ts";
// oxlint-disable-next-line import/no-unassigned-import -- Loads the root of this compiler-performance dependency chain.
import "./root.mts";

export const Bit = /*#__PURE__*/ union("0", "1");

export const templateLiteralParts04 = [Bit, Bit, Bit, Bit] as const;

export const TemplateLiteralCanonicalInput04 =
  /*#__PURE__*/ templateLiteralParser(...templateLiteralParts04);
