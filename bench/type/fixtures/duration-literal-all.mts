import {
  DurationLiteral,
  durationToMillis,
  Millis,
  type Duration,
} from "../../../packages/common/src/Time.ts";
import type { InferErrors } from "./chains/api.mts";
import "./chains/root.mts"; // oxlint-disable-line import/no-unassigned-import -- Includes the complete compiler-performance dependency chain.

export type LiteralOutput = typeof DurationLiteral.Output;
export type LiteralErrors = InferErrors<typeof DurationLiteral>;
export type LiteralFromUnknownResult = ReturnType<
  typeof DurationLiteral.fromUnknown
>;
export type ConvertInput = Parameters<typeof durationToMillis>[0];

// Literal assignability is the cost a call site pays.
const _literal: Duration = "1.5s";
const _validated: Duration = Millis.orThrow(1000);
const _converted = durationToMillis("2h");

export type Literal = typeof _literal;
export type Validated = typeof _validated;
export type Converted = typeof _converted;
