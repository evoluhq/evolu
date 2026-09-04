import {
  ByteLength,
  ByteLengthFromString,
  ByteSizeLiteral,
  byteSizeToByteLength,
  type ByteSize,
} from "../../../packages/common/src/Bytes.ts";
import type { InferErrors } from "./chains/api.mts";
import "./chains/root.mts"; // oxlint-disable-line import/no-unassigned-import -- Includes the complete compiler-performance dependency chain.

export type LiteralOutput = typeof ByteSizeLiteral.Output;
export type LiteralErrors = InferErrors<typeof ByteSizeLiteral>;
export type LiteralFromUnknownResult = ReturnType<
  typeof ByteSizeLiteral.fromUnknown
>;
export type ConvertInput = Parameters<typeof byteSizeToByteLength>[0];
export type FromStringErrors = InferErrors<typeof ByteLengthFromString>;
export type FromStringResult = ReturnType<
  typeof ByteLengthFromString.fromUnknown
>;

// Literal assignability is the cost a call site pays.
const _literal: ByteSize = "10MiB";
const _validated: ByteSize = ByteLength.orThrow(1000);
const _converted = byteSizeToByteLength("1023GiB");

export type Literal = typeof _literal;
export type Validated = typeof _validated;
export type Converted = typeof _converted;
