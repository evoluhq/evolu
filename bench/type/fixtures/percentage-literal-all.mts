import {
  PercentageLiteral,
  percentageToRatio,
  type Percentage,
} from "../../../packages/common/src/Number.ts";
import { Ratio } from "../../../packages/common/src/Type.ts";
import type { InferErrors } from "./chains/api.mts";
import "./chains/root.mts"; // oxlint-disable-line import/no-unassigned-import -- Includes the complete compiler-performance dependency chain.

export type LiteralOutput = typeof PercentageLiteral.Output;
export type LiteralErrors = InferErrors<typeof PercentageLiteral>;
export type LiteralFromUnknownResult = ReturnType<
  typeof PercentageLiteral.fromUnknown
>;
export type ConvertInput = Parameters<typeof percentageToRatio>[0];

// Literal assignability is the cost a call site pays.
const _literal: Percentage = "12.5%";
const _validated: Percentage = Ratio.orThrow(0.5);
const _converted = percentageToRatio("50%");

export type Literal = typeof _literal;
export type Validated = typeof _validated;
export type Converted = typeof _converted;
