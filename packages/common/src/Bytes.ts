/**
 * Bytes: `Uint8Array` helpers, the {@link Buffer} codec, and byte sizes.
 *
 * Sizes follow the same pattern as durations in Time.ts:
 *
 * - {@link ByteLength} is the canonical unit, a validated number of bytes.
 * - {@link ByteSizeLiteral} is the human-readable form, such as `"10MiB"`,
 *   validated at compile time and runtime.
 * - {@link ByteSize} is what APIs accept: `ByteSizeLiteral | ByteLength`.
 * - {@link byteSizeToByteLength} normalizes a `ByteSize` to a `ByteLength`.
 * - {@link ByteLengthFromString} parses either form from text.
 *
 * Buffer-based decoding functions throw instead of returning {@link Result}.
 * Result is not slow, but every successful decode would allocate one, and a
 * protocol message decodes many values. Throwing is the safe bet for that hot
 * path until benchmarks cover the alternatives. Callers convert a thrown error
 * into a Result once, at the boundary, as `parseProtocolHeader` in Protocol.ts
 * does.
 *
 * @module
 */

import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils.js";
import { assert } from "./Assert.ts";
import { err, ok, type Result } from "./Result.ts";
import { safelyStringifyUnknownValue } from "./String.ts";
import {
  brand,
  createTypeWithError,
  Digit,
  Digit1To9,
  type FiniteNumber,
  type JsonValue,
  NonNegativeInt,
  type PositiveInt,
  String,
  templateLiteral,
  type TemplateLiteralType,
  type LiteralType,
  type UnionType,
  transform,
  type Type,
  type TypeError,
  union,
  type UnionError,
} from "./Type.ts";
export { bytesToHex, concatBytes, hexToBytes } from "@noble/ciphers/utils.js";
export { bytesToUtf8, utf8ToBytes };

/**
 * Custom error for {@link Buffer}-related failures like premature end of data.
 * Provides better stack traces for debugging binary protocol issues.
 */
export class BufferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * A Buffer is a dynamic, resizable container for binary data, optimized for
 * scenarios where the final size is unknown. It grows exponentially (doubling
 * its capacity) to minimize memory reallocations and uses `subarray` for
 * efficient, copy-free data access in methods like `unwrap` and `shift`.
 *
 * ## Recommended Usage
 *
 * Create as few Buffers as possible—typically one main Buffer for the final
 * output. Temporary Buffers are allowed when necessary (e.g., for
 * variable-length headers), but avoid excessive allocations. Buffers can be
 * reused within functions by leveraging `reset` to clear contents while
 * preserving capacity, or `truncate` to adjust the length to a specific size,
 * reducing the need for new allocations. Pass Buffers to `encode*` functions to
 * append serialized data and use `decode*` functions to extract data.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertErr,
 *   assertInstanceOf,
 *   createBuffer,
 *   createIdFromString,
 *   IdBytes,
 *   idBytesToId,
 *   idBytesTypeValueLength,
 *   idToIdBytes,
 *   NonNegativeInt,
 *   trySync,
 *   decodeNonNegativeInt,
 *   encodeNonNegativeInt,
 * } from "@evolu/common";
 *
 * const buffer = createBuffer();
 * const id = createIdFromString("buffer-example");
 * encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(300));
 * buffer.extend(idToIdBytes(id));
 *
 * const decoder = createBuffer(buffer.unwrap());
 * assertEqual(decodeNonNegativeInt(decoder), 300);
 * const decodedId = idBytesToId(
 *   IdBytes.orThrow(decoder.shiftN(idBytesTypeValueLength)),
 * );
 * assertEqual(decodedId, id);
 * const result = trySync(() => decodeNonNegativeInt(decoder));
 * assertErr(result);
 * assertInstanceOf(result.error, Error);
 * assertEqual(result.error.message, "Buffer parse ended prematurely");
 * ```
 *
 * For more on exponential growth, see:
 * https://blog.mozilla.org/nnethercote/2014/11/04/please-grow-your-buffers-exponentially
 */
export interface Buffer {
  /** Returns the current capacity of the buffer. */
  getCapacity: () => NonNegativeInt;

  /** Returns the current number of bytes stored in the buffer. */
  getLength: () => NonNegativeInt;

  /**
   * Appends binary data to the buffer, resizing if necessary. Throws if
   * `arg.length` is not a non-negative safe integer.
   */
  extend: (arg: Uint8Array | ArrayLike<number>) => void;

  /**
   * Removes and returns the first byte. Throws an `Error` with message "Buffer
   * parse ended prematurely" if the buffer is empty.
   */
  shift: () => NonNegativeInt;

  /**
   * Removes and returns the first `n` bytes. Throws an `Error` with message
   * "Buffer parse ended prematurely" if fewer than `n` bytes remain.
   */
  shiftN: (n: NonNegativeInt) => Uint8Array;

  /**
   * Truncates the buffer to the specified length, discarding data from the end.
   * Throws if the new length is greater than the current length.
   */
  truncate: (length: NonNegativeInt) => void;

  /**
   * Resets the buffer to its initial empty state, preserving its capacity.
   *
   * This allows efficient buffer reuse without reallocating memory. Use this
   * when you want to clear the buffer and write new data, avoiding unnecessary
   * allocations.
   */
  reset: () => void;

  /**
   * Returns a view of the buffer’s current data. Do not modify this array, as
   * it directly alters the buffer’s internal state, potentially breaking
   * subsequent operations.
   */
  unwrap: () => Uint8Array;
}

/** Creates a {@link Buffer} for efficient byte operations. */
export const createBuffer = (
  arrayLike?: Uint8Array | ArrayLike<number>,
): Buffer => {
  const initialLength = arrayLike?.length ?? 0;
  assertBufferNonNegativeInt(initialLength, "arrayLike.length");

  let value = arrayLike ? new Uint8Array(arrayLike) : new Uint8Array(512);
  let length = initialLength;

  const buffer: Buffer = {
    getCapacity: () => value.length as NonNegativeInt,

    getLength: () => length,

    extend: (arg) => {
      const argLength = arg.length;
      assertBufferNonNegativeInt(argLength, "arg.length");

      const targetSize = length + argLength;
      assertBufferNonNegativeInt(targetSize, "Buffer length");

      if (value.length < targetSize) {
        const oldValue = value;
        const newCapacity = Math.max(value.length * 2, targetSize);
        value = new Uint8Array(newCapacity);
        value.set(oldValue);
      }
      value.set(arg, length);
      length = targetSize;
    },

    shift: () => {
      assertBufferHasRemainingBytes(length, 1);
      const first = value[0];
      value = value.subarray(1);
      length--;
      return first as NonNegativeInt;
    },

    shiftN: (n) => {
      assertBufferHasRemainingBytes(length, n);
      const subarray = value.subarray(0, n);
      value = value.subarray(n);
      length = (length - n) as NonNegativeInt;
      return subarray;
    },

    truncate: (newLength) => {
      if (newLength > length) {
        throw new BufferError(
          "Cannot truncate to a length greater than current",
        );
      }
      length = newLength;
    },

    reset: () => {
      length = 0 as NonNegativeInt;
    },

    unwrap: () => (value.length === length ? value : value.subarray(0, length)),
  };

  return buffer;
};

/**
 * Evolu uses MessagePack to handle finite numbers except for NonNegativeInt.
 * For NonNegativeInt, Evolu provides more efficient encoding.
 */
export const encodeNumber = (buffer: Buffer, number: FiniteNumber): void => {
  encodeJsonValue(buffer, number);
};

export const decodeNumber = (buffer: Buffer): FiniteNumber => {
  const value = decodeJsonValue(buffer);
  if (typeof value !== "number") {
    throw new BufferError("Expected an encoded number.");
  }
  return value;
};

/**
 * Encodes an array of boolean flags into a single byte.
 *
 * Each element in the array corresponds to a bit (0-7). Array can have 0-8
 * elements.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, createBuffer, encodeFlags } from "@evolu/common";
 *
 * const buffer = createBuffer();
 * encodeFlags(buffer, [true, false, true]);
 *
 * assertEqual(buffer.unwrap(), new Uint8Array([0b101]));
 * ```
 */
export const encodeFlags = (
  buffer: Buffer,
  flags: ReadonlyArray<boolean>,
): void => {
  let byte = 0;
  for (let i = 0; i < flags.length && i < 8; i++) {
    if (flags[i]) {
      byte |= 1 << i;
    }
  }
  buffer.extend([byte]);
};

/**
 * Decodes a byte into an array of boolean flags.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   createBuffer,
 *   decodeFlags,
 *   PositiveInt,
 * } from "@evolu/common";
 *
 * const buffer = createBuffer([0b101]);
 * const flags = decodeFlags(buffer, PositiveInt.orThrow(3));
 *
 * assertEqual(flags, [true, false, true]);
 * assertEqual(buffer.getLength(), 0);
 * ```
 */
export const decodeFlags = (
  buffer: Buffer,
  count: PositiveInt,
): ReadonlyArray<boolean> => {
  const byte = buffer.shift();
  const length = Math.min(count, 8);
  // oxlint-disable-next-line unicorn/no-new-array -- Preallocation is intentional in this decoding hot path.
  const flags = new Array<boolean>(length);
  for (let i = 0; i < length; i++) {
    flags[i] = (byte & (1 << i)) !== 0;
  }
  return flags;
};

/**
 * Encodes a non-negative integer into a variable-length integer format. It's
 * more efficient than encoding via {@link encodeNumber}.
 *
 * https://en.wikipedia.org/wiki/Variable-length_quantity
 */
export const encodeNonNegativeInt = (
  buffer: Buffer,
  value: NonNegativeInt,
): void => {
  if (value === 0) {
    buffer.extend([0]);
    return;
  }

  let remaining = BigInt(value);
  const bytes: Array<number> = [];

  while (remaining !== 0n) {
    const byte = Number(remaining & 127n);
    bytes.push(byte);
    remaining >>= 7n;
  }

  for (let i = 0; i < bytes.length - 1; i++) {
    bytes[i] |= 128;
  }

  buffer.extend(bytes);
};

/**
 * Decodes a non-negative integer from a variable-length integer format.
 *
 * https://en.wikipedia.org/wiki/Variable-length_quantity
 */
export const decodeNonNegativeInt = (buffer: Buffer): NonNegativeInt => {
  let result = 0n;
  let shift = 0n;
  let byte = 0;

  // 8 is the smallest required count
  for (let byteCount = 0; byteCount < 8; byteCount++) {
    byte = buffer.shift();
    result |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) break;
    shift += 7n;
  }

  if ((byte & 128) !== 0) {
    throw new BufferError(
      "Variable-length quantity must terminate within 8 bytes.",
    );
  }

  const value = Number(result);
  assertBufferNonNegativeInt(value, "Decoded integer");
  return value;
};

/** Encodes the length of an array-like value. */
export const encodeLength = (
  buffer: Buffer,
  value: ArrayLike<unknown>,
): void => {
  assertBufferNonNegativeInt(value.length, "Array-like length");
  encodeNonNegativeInt(buffer, value.length);
};

/** Decodes an array-like value length. */
export const decodeLength = decodeNonNegativeInt;

/** Encodes a length-prefixed UTF-8 string. */
export const encodeString = (buffer: Buffer, value: string): void => {
  const bytes = utf8ToBytes(value);
  encodeLength(buffer, bytes);
  buffer.extend(bytes);
};

/** Decodes a length-prefixed UTF-8 string. */
export const decodeString = (buffer: Buffer): string => {
  const length = decodeLength(buffer);
  const bytes = buffer.shiftN(length);
  return bytesToUtf8(bytes);
};

/** Incrementally encodes consecutive equal values using run-length encoding. */
export interface RunLengthEncoder<T> {
  readonly add: (value: T) => void;
  readonly getLength: () => NonNegativeInt;
  readonly unwrap: () => Uint8Array;
}

/** Creates an incremental run-length encoder. */
export const createRunLengthEncoder = <T>(
  encodeValue: (buffer: Buffer, value: T) => void,
): RunLengthEncoder<T> => {
  const buffer = createBuffer();
  let previousLength = 0 as NonNegativeInt;
  let previousValue = null as T | null;
  let runLength = 0 as NonNegativeInt;

  return {
    add: (value) => {
      if (Object.is(value, previousValue)) {
        runLength++;
        buffer.truncate(previousLength);
      } else {
        previousValue = value;
        runLength = 1 as NonNegativeInt;
      }
      previousLength = buffer.getLength();
      encodeValue(buffer, value);
      encodeNonNegativeInt(buffer, runLength);
    },

    getLength: () => buffer.getLength(),

    unwrap: () => buffer.unwrap(),
  };
};

/** Decodes a run-length encoded sequence. */
export const decodeRle = <T>(
  buffer: Buffer,
  length: NonNegativeInt,
  decodeValue: () => T,
): ReadonlyArray<T> => {
  // oxlint-disable-next-line unicorn/no-new-array -- Preallocation is intentional in this decoding hot path.
  const values = new Array<T>(length);
  let index = 0;
  while (index < length) {
    const value = decodeValue();
    const runLength = decodeNonNegativeInt(buffer);

    // Prevent infinite loop on malformed input.
    if (runLength === 0) {
      throw new BufferError("Invalid RLE encoding: runLength must be positive");
    }

    const remaining = length - index;

    // Prevent CPU/memory amplification via oversized runLength.
    if (runLength > remaining) {
      throw new BufferError(
        `Invalid RLE encoding: runLength ${runLength} exceeds remaining ${remaining}`,
      );
    }

    for (let i = 0; i < runLength; i++) {
      values[index] = value;
      index++;
    }
  }

  return values;
};

// Inspired by msgpackr 2.0.5, licensed under the MIT License.
// This implementation is specialized for Evolu's JsonValue domain.
//
// MIT License
//
// Copyright (c) 2020 Kris Zyp
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

interface JsonKeyCacheEntry {
  readonly bytes: Uint8Array;
  readonly value: string;
}

const jsonKeyCacheSize = 4096;
const maxCachedJsonKeyByteLength = 32;
const maxJsonNestingDepth = 1_000;
let jsonEncoderTarget = new Uint8Array(8192);
let jsonEncoderTargetView = new DataView(jsonEncoderTarget.buffer);
let jsonEncoderPosition = 0;
let jsonEncoderDepth = 0;
let jsonEncoderIsActive = false;
const emptyJsonDecoderSource: Uint8Array = new Uint8Array(0);
const emptyJsonDecoderView: DataView = new DataView(
  emptyJsonDecoderSource.buffer,
);
let jsonDecoderSource: Uint8Array = emptyJsonDecoderSource;
let jsonDecoderView: DataView = emptyJsonDecoderView;
let jsonDecoderPosition = 0;
let jsonDecoderDepth = 0;
const jsonStringFromCharCode = globalThis.String.fromCharCode;
// Cache only short keys and use a fixed table to bound retained memory.
const jsonKeyCache: Array<JsonKeyCacheEntry | undefined> = Array.from(
  { length: jsonKeyCacheSize },
  () => undefined,
);

/**
 * Encodes a {@link JsonValue} using the MessagePack format.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   createBuffer,
 *   encodeJsonValue,
 *   JsonValue,
 * } from "@evolu/common";
 *
 * const buffer = createBuffer();
 * const value = JsonValue.orThrow({ name: "Ada" });
 *
 * encodeJsonValue(buffer, value);
 *
 * assertEqual(
 *   buffer.unwrap(),
 *   new Uint8Array([
 *     0x81, 0xa4, 0x6e, 0x61, 0x6d, 0x65, 0xa3, 0x41, 0x64, 0x61,
 *   ]),
 * );
 * ```
 *
 * Encoding is artificially limited to 1,000 nested arrays or objects to keep
 * recursive encoding and decoding safe and symmetric. JSON data should not
 * require such depth; flatten or split deeply nested data, or use a
 * purpose-built serialization format.
 */
export const encodeJsonValue = (buffer: Buffer, value: JsonValue): void => {
  if (jsonEncoderIsActive) {
    throw new BufferError("Reentrant JSON encoding is not supported.");
  }
  jsonEncoderIsActive = true;
  jsonEncoderPosition = 0;

  try {
    encodeJsonValueToTarget(value);
    buffer.extend(jsonEncoderTarget.subarray(0, jsonEncoderPosition));
  } finally {
    jsonEncoderPosition = 0;
    jsonEncoderDepth = 0;
    jsonEncoderIsActive = false;
  }
};

/**
 * Decodes a {@link JsonValue} using the MessagePack format.
 *
 * Throws a {@link BufferError} without modifying the Buffer if the encoded value
 * is malformed, truncated, unsupported, outside the JsonValue domain, or
 * exceeds 1,000 nested arrays or objects.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   createBuffer,
 *   decodeJsonValue,
 * } from "@evolu/common";
 *
 * const buffer = createBuffer([
 *   0x81, 0xa4, 0x6e, 0x61, 0x6d, 0x65, 0xa3, 0x41, 0x64, 0x61,
 * ]);
 *
 * assertEqual(decodeJsonValue(buffer), { name: "Ada" });
 * assertEqual(buffer.unwrap(), new Uint8Array());
 * ```
 */
export const decodeJsonValue = (buffer: Buffer): JsonValue => {
  const source = buffer.unwrap();
  jsonDecoderSource = source;
  jsonDecoderView = new DataView(
    source.buffer,
    source.byteOffset,
    source.byteLength,
  );
  jsonDecoderPosition = 0;

  try {
    const value = decodeJsonValueFromSource();
    buffer.shiftN(jsonDecoderPosition as NonNegativeInt);
    return value;
  } catch (error) {
    if (error instanceof BufferError) throw error;

    throw new BufferError("Invalid MessagePack data");
  } finally {
    jsonDecoderSource = emptyJsonDecoderSource;
    jsonDecoderView = emptyJsonDecoderView;
    jsonDecoderPosition = 0;
    jsonDecoderDepth = 0;
  }
};

const encodeJsonValueToTarget = (value: JsonValue): void => {
  if (value === null) {
    writeJsonEncoderByte(0xc0);
    return;
  }

  // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- JsonValue excludes the additional runtime types reported by tsgolint.
  switch (typeof value) {
    case "string":
      encodeJsonStringToTarget(value);
      return;
    case "number": {
      if (Object.is(value, -0)) {
        ensureJsonEncoderCapacity(9);
        jsonEncoderTarget[jsonEncoderPosition++] = 0xcb;
        jsonEncoderTargetView.setFloat64(jsonEncoderPosition, value);
        jsonEncoderPosition += 8;
        return;
      }

      if (value >>> 0 === value) {
        if (value < 0x80) {
          writeJsonEncoderByte(value);
        } else if (value < 0x100) {
          ensureJsonEncoderCapacity(2);
          jsonEncoderTarget[jsonEncoderPosition++] = 0xcc;
          jsonEncoderTarget[jsonEncoderPosition++] = value;
        } else if (value < 0x10000) {
          ensureJsonEncoderCapacity(3);
          jsonEncoderTarget[jsonEncoderPosition++] = 0xcd;
          jsonEncoderTargetView.setUint16(jsonEncoderPosition, value);
          jsonEncoderPosition += 2;
        } else {
          ensureJsonEncoderCapacity(5);
          jsonEncoderTarget[jsonEncoderPosition++] = 0xce;
          jsonEncoderTargetView.setUint32(jsonEncoderPosition, value);
          jsonEncoderPosition += 4;
        }
        return;
      }

      if (Number.isInteger(value) && value >= -0x80000000 && value < 0) {
        if (value >= -0x20) {
          writeJsonEncoderByte(0x100 + value);
        } else if (value >= -0x80) {
          ensureJsonEncoderCapacity(2);
          jsonEncoderTarget[jsonEncoderPosition++] = 0xd0;
          jsonEncoderTargetView.setInt8(jsonEncoderPosition++, value);
        } else if (value >= -0x8000) {
          ensureJsonEncoderCapacity(3);
          jsonEncoderTarget[jsonEncoderPosition++] = 0xd1;
          jsonEncoderTargetView.setInt16(jsonEncoderPosition, value);
          jsonEncoderPosition += 2;
        } else {
          ensureJsonEncoderCapacity(5);
          jsonEncoderTarget[jsonEncoderPosition++] = 0xd2;
          jsonEncoderTargetView.setInt32(jsonEncoderPosition, value);
          jsonEncoderPosition += 4;
        }
        return;
      }

      ensureJsonEncoderCapacity(9);
      jsonEncoderTarget[jsonEncoderPosition++] = 0xcb;
      jsonEncoderTargetView.setFloat64(jsonEncoderPosition, value);
      jsonEncoderPosition += 8;
      return;
    }
    case "boolean":
      writeJsonEncoderByte(value ? 0xc3 : 0xc2);
      return;
    case "object": {
      if (jsonEncoderDepth >= maxJsonNestingDepth) {
        throw new BufferError(
          `JSON nesting exceeds the maximum depth of ${maxJsonNestingDepth}.`,
        );
      }
      jsonEncoderDepth++;

      if (Array.isArray(value)) {
        const array = value as ReadonlyArray<JsonValue>;
        const length = array.length;
        writeJsonCollectionHeader(length, 0x90, 0xdc, 0xdd);

        for (const item of array) encodeJsonValueToTarget(item);
        jsonEncoderDepth--;
        return;
      }

      const object = value as Readonly<Record<string, JsonValue>>;
      const keys = Object.keys(object);
      writeJsonCollectionHeader(keys.length, 0x80, 0xde, 0xdf);

      for (const key of keys) {
        encodeJsonStringToTarget(key);
        encodeJsonValueToTarget(object[key]);
      }
      jsonEncoderDepth--;
    }
  }
};

const encodeJsonStringToTarget = (value: string): void => {
  const valueLength = value.length;
  const headerLength =
    valueLength < 0x20
      ? 1
      : valueLength < 0x100
        ? 2
        : valueLength < 0x10000
          ? 3
          : 5;
  ensureJsonEncoderCapacity(5 + valueLength * 3);

  const headerPosition = jsonEncoderPosition;
  jsonEncoderPosition += headerLength;

  for (let index = 0; index < valueLength; index++) {
    let first = value.charCodeAt(index);

    if (first < 0x80) {
      jsonEncoderTarget[jsonEncoderPosition++] = first;
    } else if (first < 0x800) {
      jsonEncoderTarget[jsonEncoderPosition++] = (first >> 6) | 0xc0;
      jsonEncoderTarget[jsonEncoderPosition++] = (first & 0x3f) | 0x80;
    } else if (
      (first & 0xfc00) === 0xd800 &&
      (value.charCodeAt(index + 1) & 0xfc00) === 0xdc00
    ) {
      const second = value.charCodeAt(++index);
      first = 0x10000 + ((first & 0x03ff) << 10) + (second & 0x03ff);
      jsonEncoderTarget[jsonEncoderPosition++] = (first >> 18) | 0xf0;
      jsonEncoderTarget[jsonEncoderPosition++] = ((first >> 12) & 0x3f) | 0x80;
      jsonEncoderTarget[jsonEncoderPosition++] = ((first >> 6) & 0x3f) | 0x80;
      jsonEncoderTarget[jsonEncoderPosition++] = (first & 0x3f) | 0x80;
    } else {
      jsonEncoderTarget[jsonEncoderPosition++] = (first >> 12) | 0xe0;
      jsonEncoderTarget[jsonEncoderPosition++] = ((first >> 6) & 0x3f) | 0x80;
      jsonEncoderTarget[jsonEncoderPosition++] = (first & 0x3f) | 0x80;
    }
  }

  const byteLength = jsonEncoderPosition - headerPosition - headerLength;
  assertMessagePackLength(byteLength, "String byte length");

  if (byteLength < 0x20) {
    jsonEncoderTarget[headerPosition] = 0xa0 | byteLength;
    return;
  }

  if (byteLength < 0x100) {
    if (headerLength === 1) {
      jsonEncoderTarget.copyWithin(
        headerPosition + 2,
        headerPosition + 1,
        jsonEncoderPosition,
      );
      jsonEncoderPosition++;
    }
    jsonEncoderTarget[headerPosition] = 0xd9;
    jsonEncoderTarget[headerPosition + 1] = byteLength;
    return;
  }

  if (byteLength < 0x10000) {
    if (headerLength < 3) {
      const additionalHeaderLength = 3 - headerLength;
      jsonEncoderTarget.copyWithin(
        headerPosition + 3,
        headerPosition + headerLength,
        jsonEncoderPosition,
      );
      jsonEncoderPosition += additionalHeaderLength;
    }
    jsonEncoderTarget[headerPosition] = 0xda;
    jsonEncoderTargetView.setUint16(headerPosition + 1, byteLength);
    return;
  }

  if (headerLength < 5) {
    const additionalHeaderLength = 5 - headerLength;
    jsonEncoderTarget.copyWithin(
      headerPosition + 5,
      headerPosition + headerLength,
      jsonEncoderPosition,
    );
    jsonEncoderPosition += additionalHeaderLength;
  }
  jsonEncoderTarget[headerPosition] = 0xdb;
  jsonEncoderTargetView.setUint32(headerPosition + 1, byteLength);
};

const writeJsonCollectionHeader = (
  length: number,
  fixedMarker: number,
  marker16: number,
  marker32: number,
): void => {
  assertMessagePackLength(length, "Collection length");

  if (length < 0x10) {
    writeJsonEncoderByte(fixedMarker | length);
  } else if (length < 0x10000) {
    ensureJsonEncoderCapacity(3);
    jsonEncoderTarget[jsonEncoderPosition++] = marker16;
    jsonEncoderTargetView.setUint16(jsonEncoderPosition, length);
    jsonEncoderPosition += 2;
  } else {
    ensureJsonEncoderCapacity(5);
    jsonEncoderTarget[jsonEncoderPosition++] = marker32;
    jsonEncoderTargetView.setUint32(jsonEncoderPosition, length);
    jsonEncoderPosition += 4;
  }
};

const writeJsonEncoderByte = (value: number): void => {
  ensureJsonEncoderCapacity(1);
  jsonEncoderTarget[jsonEncoderPosition++] = value;
};

const ensureJsonEncoderCapacity = (additionalLength: number): void => {
  const requiredLength = jsonEncoderPosition + additionalLength;
  assertBufferNonNegativeInt(requiredLength, "Encoded JSON value length");

  if (requiredLength <= jsonEncoderTarget.length) return;

  const newCapacity = Math.max(jsonEncoderTarget.length * 2, requiredLength);
  assertBufferNonNegativeInt(newCapacity, "JSON encoder capacity");

  const oldTarget = jsonEncoderTarget;
  jsonEncoderTarget = new Uint8Array(newCapacity);
  jsonEncoderTarget.set(oldTarget.subarray(0, jsonEncoderPosition));
  jsonEncoderTargetView = new DataView(jsonEncoderTarget.buffer);
};

const assertMessagePackLength = (length: number, name: string): void => {
  if (length > 0xffffffff) {
    throw new BufferError(`${name} exceeds the MessagePack uint32 limit.`);
  }
};

const decodeJsonValueFromSource = (): JsonValue => {
  const marker = readJsonDecoderByte();

  if (marker <= 0x7f) return marker as JsonValue;
  if (marker <= 0x8f) return decodeJsonMap(marker - 0x80);
  if (marker <= 0x9f) return decodeJsonArray(marker - 0x90);
  if (marker <= 0xbf) return decodeJsonString(marker - 0xa0);
  if (marker >= 0xe0) return (marker - 0x100) as JsonValue;

  switch (marker) {
    case 0xc0:
      return null;
    case 0xc2:
      return false;
    case 0xc3:
      return true;
    case 0xca:
      return decodeJsonFloat(4);
    case 0xcb:
      return decodeJsonFloat(8);
    case 0xcc:
      return readJsonDecoderByte() as JsonValue;
    case 0xcd:
      return readJsonUint16() as JsonValue;
    case 0xce:
      return readJsonUint32() as JsonValue;
    case 0xd0: {
      assertJsonDecoderHasRemainingBytes(1);
      return jsonDecoderView.getInt8(jsonDecoderPosition++) as JsonValue;
    }
    case 0xd1: {
      assertJsonDecoderHasRemainingBytes(2);
      const value = jsonDecoderView.getInt16(jsonDecoderPosition);
      jsonDecoderPosition += 2;
      return value as JsonValue;
    }
    case 0xd2: {
      assertJsonDecoderHasRemainingBytes(4);
      const value = jsonDecoderView.getInt32(jsonDecoderPosition);
      jsonDecoderPosition += 4;
      return value as JsonValue;
    }
    case 0xd9:
      return decodeJsonString(readJsonDecoderByte());
    case 0xda:
      return decodeJsonString(readJsonUint16());
    case 0xdb:
      return decodeJsonString(readJsonUint32());
    case 0xdc:
      return decodeJsonArray(readJsonUint16());
    case 0xdd:
      return decodeJsonArray(readJsonUint32());
    case 0xde:
      return decodeJsonMap(readJsonUint16());
    case 0xdf:
      return decodeJsonMap(readJsonUint32());
    default:
      throw new BufferError(
        `Unsupported MessagePack marker 0x${marker.toString(16).padStart(2, "0")}.`,
      );
  }
};

const decodeJsonFloat = (byteLength: 4 | 8): JsonValue => {
  assertJsonDecoderHasRemainingBytes(byteLength);
  const value =
    byteLength === 4
      ? jsonDecoderView.getFloat32(jsonDecoderPosition)
      : jsonDecoderView.getFloat64(jsonDecoderPosition);
  jsonDecoderPosition += byteLength;

  if (!Number.isFinite(value)) {
    throw new BufferError("A decoded JSON number must be finite.");
  }
  return value as JsonValue;
};

const decodeJsonString = (byteLength: number): string => {
  assertJsonDecoderHasRemainingBytes(byteLength);

  shortAscii: if (byteLength < 16) {
    if (byteLength === 0) return "";

    const start = jsonDecoderPosition;
    const first = jsonDecoderSource[jsonDecoderPosition++];

    if ((first & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 1) return jsonStringFromCharCode(first);

    const second = jsonDecoderSource[jsonDecoderPosition++];
    if ((second & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 2) return jsonStringFromCharCode(first, second);

    const third = jsonDecoderSource[jsonDecoderPosition++];
    if ((third & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 3) return jsonStringFromCharCode(first, second, third);

    const fourth = jsonDecoderSource[jsonDecoderPosition++];
    if ((fourth & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 4) {
      return jsonStringFromCharCode(first, second, third, fourth);
    }

    const fifth = jsonDecoderSource[jsonDecoderPosition++];
    if ((fifth & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 5) {
      return jsonStringFromCharCode(first, second, third, fourth, fifth);
    }

    const sixth = jsonDecoderSource[jsonDecoderPosition++];
    if ((sixth & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 6) {
      return jsonStringFromCharCode(first, second, third, fourth, fifth, sixth);
    }

    const seventh = jsonDecoderSource[jsonDecoderPosition++];
    if ((seventh & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 7) {
      return jsonStringFromCharCode(
        first,
        second,
        third,
        fourth,
        fifth,
        sixth,
        seventh,
      );
    }

    const eighth = jsonDecoderSource[jsonDecoderPosition++];
    if ((eighth & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 8) {
      return jsonStringFromCharCode(
        first,
        second,
        third,
        fourth,
        fifth,
        sixth,
        seventh,
        eighth,
      );
    }

    const ninth = jsonDecoderSource[jsonDecoderPosition++];
    if ((ninth & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 9) {
      return jsonStringFromCharCode(
        first,
        second,
        third,
        fourth,
        fifth,
        sixth,
        seventh,
        eighth,
        ninth,
      );
    }

    const tenth = jsonDecoderSource[jsonDecoderPosition++];
    if ((tenth & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 10) {
      return jsonStringFromCharCode(
        first,
        second,
        third,
        fourth,
        fifth,
        sixth,
        seventh,
        eighth,
        ninth,
        tenth,
      );
    }

    const eleventh = jsonDecoderSource[jsonDecoderPosition++];
    if ((eleventh & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 11) {
      return jsonStringFromCharCode(
        first,
        second,
        third,
        fourth,
        fifth,
        sixth,
        seventh,
        eighth,
        ninth,
        tenth,
        eleventh,
      );
    }

    const twelfth = jsonDecoderSource[jsonDecoderPosition++];
    if ((twelfth & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 12) {
      return jsonStringFromCharCode(
        first,
        second,
        third,
        fourth,
        fifth,
        sixth,
        seventh,
        eighth,
        ninth,
        tenth,
        eleventh,
        twelfth,
      );
    }

    const thirteenth = jsonDecoderSource[jsonDecoderPosition++];
    if ((thirteenth & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 13) {
      return jsonStringFromCharCode(
        first,
        second,
        third,
        fourth,
        fifth,
        sixth,
        seventh,
        eighth,
        ninth,
        tenth,
        eleventh,
        twelfth,
        thirteenth,
      );
    }

    const fourteenth = jsonDecoderSource[jsonDecoderPosition++];
    if ((fourteenth & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    if (byteLength === 14) {
      return jsonStringFromCharCode(
        first,
        second,
        third,
        fourth,
        fifth,
        sixth,
        seventh,
        eighth,
        ninth,
        tenth,
        eleventh,
        twelfth,
        thirteenth,
        fourteenth,
      );
    }

    const fifteenth = jsonDecoderSource[jsonDecoderPosition++];
    if ((fifteenth & 0x80) !== 0) {
      jsonDecoderPosition = start;
      break shortAscii;
    }
    return jsonStringFromCharCode(
      first,
      second,
      third,
      fourth,
      fifth,
      sixth,
      seventh,
      eighth,
      ninth,
      tenth,
      eleventh,
      twelfth,
      thirteenth,
      fourteenth,
      fifteenth,
    );
  }

  const end = jsonDecoderPosition + byteLength;
  const units: Array<number> = [];
  let result = "";

  while (jsonDecoderPosition < end) {
    const first = jsonDecoderSource[jsonDecoderPosition++];

    if (first < 0x80) {
      units.push(first);
    } else if (first >= 0xc2 && first <= 0xdf) {
      assertJsonStringHasRemainingBytes(end, 1);
      const second = readJsonContinuationByte();
      units.push(((first & 0x1f) << 6) | second);
    } else if (first >= 0xe0 && first <= 0xef) {
      assertJsonStringHasRemainingBytes(end, 2);
      const secondByte = jsonDecoderSource[jsonDecoderPosition];
      if (first === 0xe0 && secondByte < 0xa0) {
        throw new BufferError("Invalid UTF-8 string encoding.");
      }
      const second = readJsonContinuationByte();
      const third = readJsonContinuationByte();
      units.push(((first & 0x0f) << 12) | (second << 6) | third);
    } else if (first >= 0xf0 && first <= 0xf4) {
      assertJsonStringHasRemainingBytes(end, 3);
      const secondByte = jsonDecoderSource[jsonDecoderPosition];
      if (
        (first === 0xf0 && secondByte < 0x90) ||
        (first === 0xf4 && secondByte > 0x8f)
      ) {
        throw new BufferError("Invalid UTF-8 string encoding.");
      }
      const second = readJsonContinuationByte();
      const third = readJsonContinuationByte();
      const fourth = readJsonContinuationByte();
      const codePoint =
        ((first & 0x07) << 18) | (second << 12) | (third << 6) | fourth;
      const pair = codePoint - 0x10000;
      units.push(0xd800 | (pair >> 10), 0xdc00 | (pair & 0x3ff));
    } else {
      throw new BufferError("Invalid UTF-8 string encoding.");
    }

    if (units.length >= 0x1000) {
      result += jsonStringFromCharCode(...units);
      units.length = 0;
    }
  }

  if (units.length > 0) {
    result += jsonStringFromCharCode(...units);
  }
  return result;
};

const decodeJsonArray = (length: number): JsonValue => {
  if (jsonDecoderDepth >= maxJsonNestingDepth) {
    throw new BufferError(
      `JSON nesting exceeds the maximum depth of ${maxJsonNestingDepth}.`,
    );
  }
  if (length > jsonDecoderSource.length - jsonDecoderPosition) {
    throw new BufferError("Buffer parse ended prematurely");
  }

  // oxlint-disable-next-line unicorn/no-new-array -- Preallocation is intentional in this decoding hot path.
  const value = new Array<JsonValue>(length);
  jsonDecoderDepth++;
  for (let index = 0; index < length; index++) {
    value[index] = decodeJsonValueFromSource();
  }
  jsonDecoderDepth--;
  return value;
};

const decodeJsonMap = (length: number): JsonValue => {
  if (jsonDecoderDepth >= maxJsonNestingDepth) {
    throw new BufferError(
      `JSON nesting exceeds the maximum depth of ${maxJsonNestingDepth}.`,
    );
  }
  if (length > (jsonDecoderSource.length - jsonDecoderPosition) / 2) {
    throw new BufferError("Buffer parse ended prematurely");
  }

  const value: Record<string, JsonValue> = {};
  jsonDecoderDepth++;
  for (let index = 0; index < length; index++) {
    const marker = readJsonDecoderByte();
    let key: string;

    if (marker >= 0xa0 && marker <= 0xbf) {
      key = decodeCachedJsonKey(marker - 0xa0);
    } else if (marker === 0xd9) {
      key = decodeCachedJsonKey(readJsonDecoderByte());
    } else if (marker === 0xda) {
      key = decodeCachedJsonKey(readJsonUint16());
    } else if (marker === 0xdb) {
      key = decodeCachedJsonKey(readJsonUint32());
    } else {
      jsonDecoderPosition--;
      decodeJsonValueFromSource();
      throw new BufferError("A decoded JSON object key must be a string.");
    }

    const entryValue = decodeJsonValueFromSource();

    if (key === "__proto__") {
      Object.defineProperty(value, key, {
        value: entryValue,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    } else {
      value[key] = entryValue;
    }
  }
  jsonDecoderDepth--;
  return value;
};

const decodeCachedJsonKey = (byteLength: number): string => {
  if (byteLength > maxCachedJsonKeyByteLength) {
    return decodeJsonString(byteLength);
  }

  assertJsonDecoderHasRemainingBytes(byteLength);
  const start = jsonDecoderPosition;
  const end = start + byteLength;
  const firstBytes =
    byteLength > 1
      ? jsonDecoderView.getUint16(start)
      : byteLength === 1
        ? jsonDecoderSource[start]
        : 0;
  const cacheIndex = ((byteLength << 5) ^ firstBytes) & (jsonKeyCacheSize - 1);
  const entry = jsonKeyCache[cacheIndex];

  if (entry?.bytes.length === byteLength) {
    let index = 0;
    while (
      index < byteLength &&
      entry.bytes[index] === jsonDecoderSource[start + index]
    ) {
      index++;
    }
    if (index === byteLength) {
      jsonDecoderPosition = end;
      return entry.value;
    }
  }

  const value = decodeJsonString(byteLength);
  jsonKeyCache[cacheIndex] = {
    bytes: jsonDecoderSource.slice(start, end),
    value,
  };
  return value;
};

const readJsonContinuationByte = (): number => {
  const byte = jsonDecoderSource[jsonDecoderPosition++];
  if ((byte & 0xc0) !== 0x80) {
    throw new BufferError("Invalid UTF-8 string encoding.");
  }
  return byte & 0x3f;
};

const assertJsonStringHasRemainingBytes = (
  end: number,
  requiredBytes: number,
): void => {
  if (end - jsonDecoderPosition < requiredBytes) {
    throw new BufferError("Invalid UTF-8 string encoding.");
  }
};

const readJsonDecoderByte = (): number => {
  assertJsonDecoderHasRemainingBytes(1);
  return jsonDecoderSource[jsonDecoderPosition++];
};

const readJsonUint16 = (): number => {
  assertJsonDecoderHasRemainingBytes(2);
  const value = jsonDecoderView.getUint16(jsonDecoderPosition);
  jsonDecoderPosition += 2;
  return value;
};

const readJsonUint32 = (): number => {
  assertJsonDecoderHasRemainingBytes(4);
  const value = jsonDecoderView.getUint32(jsonDecoderPosition);
  jsonDecoderPosition += 4;
  return value;
};

const assertJsonDecoderHasRemainingBytes = (requiredBytes: number): void => {
  if (jsonDecoderSource.length - jsonDecoderPosition < requiredBytes) {
    throw new BufferError("Buffer parse ended prematurely");
  }
};

const assertBufferNonNegativeInt: (
  value: number,
  name: string,
) => asserts value is NonNegativeInt = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BufferError(`${name} must be a non-negative safe integer.`);
  }
};

const assertBufferHasRemainingBytes = (
  remainingBytes: number,
  requiredBytes: number,
): void => {
  if (remainingBytes < requiredBytes) {
    throw new BufferError("Buffer parse ended prematurely");
  }
};

/**
 * Non-negative safe integer number of bytes.
 *
 * The canonical unit for sizes, as milliseconds are for time. APIs accept
 * {@link ByteSize} and normalize it with {@link byteSizeToByteLength}. Parse text
 * such as an environment variable with {@link ByteLengthFromString}. Negative
 * zero is rejected so zero has one canonical representation.
 *
 * ### Example
 *
 * ```ts
 * import { assertErr, assertOk, ByteLength } from "@evolu/common";
 *
 * assertOk(ByteLength.fromUnknown(0), 0);
 * assertOk(ByteLength.fromUnknown(1024), 1024);
 * assertErr(ByteLength.fromUnknown(-0));
 * assertErr(ByteLength.fromUnknown(-1));
 * assertErr(ByteLength.fromUnknown(1.5));
 * ```
 */
export const ByteLength = /*#__PURE__*/ brand(
  "ByteLength",
  NonNegativeInt,
  (value) =>
    Object.is(value, -0)
      ? err<ByteLengthError>({ type: "ByteLength", value })
      : ok(),
  () => "The value -0 is not a byte length. Use 0 instead.",
);
export type ByteLength = typeof ByteLength.Output;

/** Error returned when {@link ByteLength} rejects negative zero. */
export interface ByteLengthError extends TypeError<"ByteLength"> {
  readonly value: number;
}

const Digit0To1 = /*#__PURE__*/ union("0", "1");
const Digit0To3 = /*#__PURE__*/ union("0", "1", "2", "3");

// Keep these annotations concrete. Generic unit wrappers add thousands of
// compiler instantiations to pnpm bench:type.
/** Bytes: `"0B"` to `"1023B"`. See {@link ByteSizeLiteral}. */
export const ByteSizeLiteralBytes: UnionType<
  readonly [
    TemplateLiteralType<readonly [typeof Digit, "B"]>,
    TemplateLiteralType<readonly [typeof Digit1To9, typeof Digit, "B"]>,
    TemplateLiteralType<
      readonly [typeof Digit1To9, typeof Digit, typeof Digit, "B"]
    >,
    TemplateLiteralType<
      readonly [
        "10",
        UnionType<readonly [LiteralType<"0">, LiteralType<"1">]>,
        typeof Digit,
        "B",
      ]
    >,
    TemplateLiteralType<
      readonly [
        "102",
        UnionType<
          readonly [
            LiteralType<"0">,
            LiteralType<"1">,
            LiteralType<"2">,
            LiteralType<"3">,
          ]
        >,
        "B",
      ]
    >,
  ]
> = /*#__PURE__*/ union(
  /*#__PURE__*/ templateLiteral(Digit, "B"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, "B"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, Digit, "B"),
  /*#__PURE__*/ templateLiteral("10", Digit0To1, Digit, "B"),
  /*#__PURE__*/ templateLiteral("102", Digit0To3, "B"),
);
export type ByteSizeLiteralBytes = typeof ByteSizeLiteralBytes.Output;

/**
 * KiB: `"1KiB"` to `"1023KiB"` or `"1.5KiB"` to `"1023.5KiB"`. See
 * {@link ByteSizeLiteral}.
 */
export const ByteSizeLiteralKiB: UnionType<
  readonly [
    TemplateLiteralType<readonly [typeof Digit1To9, "KiB"]>,
    TemplateLiteralType<readonly [typeof Digit1To9, typeof Digit, "KiB"]>,
    TemplateLiteralType<
      readonly [typeof Digit1To9, typeof Digit, typeof Digit, "KiB"]
    >,
    TemplateLiteralType<
      readonly [
        "10",
        UnionType<readonly [LiteralType<"0">, LiteralType<"1">]>,
        typeof Digit,
        "KiB",
      ]
    >,
    TemplateLiteralType<
      readonly [
        "102",
        UnionType<
          readonly [
            LiteralType<"0">,
            LiteralType<"1">,
            LiteralType<"2">,
            LiteralType<"3">,
          ]
        >,
        "KiB",
      ]
    >,
    TemplateLiteralType<readonly [typeof Digit1To9, ".5KiB"]>,
    TemplateLiteralType<readonly [typeof Digit1To9, typeof Digit, ".5KiB"]>,
    TemplateLiteralType<
      readonly [typeof Digit1To9, typeof Digit, typeof Digit, ".5KiB"]
    >,
    TemplateLiteralType<
      readonly [
        "10",
        UnionType<readonly [LiteralType<"0">, LiteralType<"1">]>,
        typeof Digit,
        ".5KiB",
      ]
    >,
    TemplateLiteralType<
      readonly [
        "102",
        UnionType<
          readonly [
            LiteralType<"0">,
            LiteralType<"1">,
            LiteralType<"2">,
            LiteralType<"3">,
          ]
        >,
        ".5KiB",
      ]
    >,
  ]
> = /*#__PURE__*/ union(
  /*#__PURE__*/ templateLiteral(Digit1To9, "KiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, "KiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, Digit, "KiB"),
  /*#__PURE__*/ templateLiteral("10", Digit0To1, Digit, "KiB"),
  /*#__PURE__*/ templateLiteral("102", Digit0To3, "KiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, ".5KiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, ".5KiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, Digit, ".5KiB"),
  /*#__PURE__*/ templateLiteral("10", Digit0To1, Digit, ".5KiB"),
  /*#__PURE__*/ templateLiteral("102", Digit0To3, ".5KiB"),
);
export type ByteSizeLiteralKiB = typeof ByteSizeLiteralKiB.Output;

/**
 * MiB: `"1MiB"` to `"1023MiB"` or `"1.5MiB"` to `"1023.5MiB"`. See
 * {@link ByteSizeLiteral}.
 */
export const ByteSizeLiteralMiB: UnionType<
  readonly [
    TemplateLiteralType<readonly [typeof Digit1To9, "MiB"]>,
    TemplateLiteralType<readonly [typeof Digit1To9, typeof Digit, "MiB"]>,
    TemplateLiteralType<
      readonly [typeof Digit1To9, typeof Digit, typeof Digit, "MiB"]
    >,
    TemplateLiteralType<
      readonly [
        "10",
        UnionType<readonly [LiteralType<"0">, LiteralType<"1">]>,
        typeof Digit,
        "MiB",
      ]
    >,
    TemplateLiteralType<
      readonly [
        "102",
        UnionType<
          readonly [
            LiteralType<"0">,
            LiteralType<"1">,
            LiteralType<"2">,
            LiteralType<"3">,
          ]
        >,
        "MiB",
      ]
    >,
    TemplateLiteralType<readonly [typeof Digit1To9, ".5MiB"]>,
    TemplateLiteralType<readonly [typeof Digit1To9, typeof Digit, ".5MiB"]>,
    TemplateLiteralType<
      readonly [typeof Digit1To9, typeof Digit, typeof Digit, ".5MiB"]
    >,
    TemplateLiteralType<
      readonly [
        "10",
        UnionType<readonly [LiteralType<"0">, LiteralType<"1">]>,
        typeof Digit,
        ".5MiB",
      ]
    >,
    TemplateLiteralType<
      readonly [
        "102",
        UnionType<
          readonly [
            LiteralType<"0">,
            LiteralType<"1">,
            LiteralType<"2">,
            LiteralType<"3">,
          ]
        >,
        ".5MiB",
      ]
    >,
  ]
> = /*#__PURE__*/ union(
  /*#__PURE__*/ templateLiteral(Digit1To9, "MiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, "MiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, Digit, "MiB"),
  /*#__PURE__*/ templateLiteral("10", Digit0To1, Digit, "MiB"),
  /*#__PURE__*/ templateLiteral("102", Digit0To3, "MiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, ".5MiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, ".5MiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, Digit, ".5MiB"),
  /*#__PURE__*/ templateLiteral("10", Digit0To1, Digit, ".5MiB"),
  /*#__PURE__*/ templateLiteral("102", Digit0To3, ".5MiB"),
);
export type ByteSizeLiteralMiB = typeof ByteSizeLiteralMiB.Output;

/**
 * GiB: `"1GiB"` to `"1023GiB"` or `"1.5GiB"` to `"1023.5GiB"`. See
 * {@link ByteSizeLiteral}.
 */
export const ByteSizeLiteralGiB: UnionType<
  readonly [
    TemplateLiteralType<readonly [typeof Digit1To9, "GiB"]>,
    TemplateLiteralType<readonly [typeof Digit1To9, typeof Digit, "GiB"]>,
    TemplateLiteralType<
      readonly [typeof Digit1To9, typeof Digit, typeof Digit, "GiB"]
    >,
    TemplateLiteralType<
      readonly [
        "10",
        UnionType<readonly [LiteralType<"0">, LiteralType<"1">]>,
        typeof Digit,
        "GiB",
      ]
    >,
    TemplateLiteralType<
      readonly [
        "102",
        UnionType<
          readonly [
            LiteralType<"0">,
            LiteralType<"1">,
            LiteralType<"2">,
            LiteralType<"3">,
          ]
        >,
        "GiB",
      ]
    >,
    TemplateLiteralType<readonly [typeof Digit1To9, ".5GiB"]>,
    TemplateLiteralType<readonly [typeof Digit1To9, typeof Digit, ".5GiB"]>,
    TemplateLiteralType<
      readonly [typeof Digit1To9, typeof Digit, typeof Digit, ".5GiB"]
    >,
    TemplateLiteralType<
      readonly [
        "10",
        UnionType<readonly [LiteralType<"0">, LiteralType<"1">]>,
        typeof Digit,
        ".5GiB",
      ]
    >,
    TemplateLiteralType<
      readonly [
        "102",
        UnionType<
          readonly [
            LiteralType<"0">,
            LiteralType<"1">,
            LiteralType<"2">,
            LiteralType<"3">,
          ]
        >,
        ".5GiB",
      ]
    >,
  ]
> = /*#__PURE__*/ union(
  /*#__PURE__*/ templateLiteral(Digit1To9, "GiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, "GiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, Digit, "GiB"),
  /*#__PURE__*/ templateLiteral("10", Digit0To1, Digit, "GiB"),
  /*#__PURE__*/ templateLiteral("102", Digit0To3, "GiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, ".5GiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, ".5GiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, Digit, ".5GiB"),
  /*#__PURE__*/ templateLiteral("10", Digit0To1, Digit, ".5GiB"),
  /*#__PURE__*/ templateLiteral("102", Digit0To3, ".5GiB"),
);
export type ByteSizeLiteralGiB = typeof ByteSizeLiteralGiB.Output;

/**
 * TiB: `"1TiB"` to `"1023TiB"` or `"1.5TiB"` to `"1023.5TiB"`. See
 * {@link ByteSizeLiteral}.
 */
export const ByteSizeLiteralTiB: UnionType<
  readonly [
    TemplateLiteralType<readonly [typeof Digit1To9, "TiB"]>,
    TemplateLiteralType<readonly [typeof Digit1To9, typeof Digit, "TiB"]>,
    TemplateLiteralType<
      readonly [typeof Digit1To9, typeof Digit, typeof Digit, "TiB"]
    >,
    TemplateLiteralType<
      readonly [
        "10",
        UnionType<readonly [LiteralType<"0">, LiteralType<"1">]>,
        typeof Digit,
        "TiB",
      ]
    >,
    TemplateLiteralType<
      readonly [
        "102",
        UnionType<
          readonly [
            LiteralType<"0">,
            LiteralType<"1">,
            LiteralType<"2">,
            LiteralType<"3">,
          ]
        >,
        "TiB",
      ]
    >,
    TemplateLiteralType<readonly [typeof Digit1To9, ".5TiB"]>,
    TemplateLiteralType<readonly [typeof Digit1To9, typeof Digit, ".5TiB"]>,
    TemplateLiteralType<
      readonly [typeof Digit1To9, typeof Digit, typeof Digit, ".5TiB"]
    >,
    TemplateLiteralType<
      readonly [
        "10",
        UnionType<readonly [LiteralType<"0">, LiteralType<"1">]>,
        typeof Digit,
        ".5TiB",
      ]
    >,
    TemplateLiteralType<
      readonly [
        "102",
        UnionType<
          readonly [
            LiteralType<"0">,
            LiteralType<"1">,
            LiteralType<"2">,
            LiteralType<"3">,
          ]
        >,
        ".5TiB",
      ]
    >,
  ]
> = /*#__PURE__*/ union(
  /*#__PURE__*/ templateLiteral(Digit1To9, "TiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, "TiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, Digit, "TiB"),
  /*#__PURE__*/ templateLiteral("10", Digit0To1, Digit, "TiB"),
  /*#__PURE__*/ templateLiteral("102", Digit0To3, "TiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, ".5TiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, ".5TiB"),
  /*#__PURE__*/ templateLiteral(Digit1To9, Digit, Digit, ".5TiB"),
  /*#__PURE__*/ templateLiteral("10", Digit0To1, Digit, ".5TiB"),
  /*#__PURE__*/ templateLiteral("102", Digit0To3, ".5TiB"),
);
export type ByteSizeLiteralTiB = typeof ByteSizeLiteralTiB.Output;

export type ByteSizeLiteral =
  | ByteSizeLiteralBytes
  | ByteSizeLiteralKiB
  | ByteSizeLiteralMiB
  | ByteSizeLiteralGiB
  | ByteSizeLiteralTiB;

const byteSizeLiteralSyntax = /*#__PURE__*/ union(
  ByteSizeLiteralBytes,
  ByteSizeLiteralKiB,
  ByteSizeLiteralMiB,
  ByteSizeLiteralGiB,
  ByteSizeLiteralTiB,
);

/**
 * Byte length literal Type with compile-time and runtime validation.
 *
 * Supported formats:
 *
 * - Bytes: `0B` to `1023B`
 * - KiB: `1KiB` to `1023KiB` or `1.5KiB` to `1023.5KiB`
 * - MiB: `1MiB` to `1023MiB` or `1.5MiB` to `1023.5MiB`
 * - GiB: `1GiB` to `1023GiB` or `1.5GiB` to `1023.5GiB`
 * - TiB: `1TiB` to `1023TiB` or `1.5TiB` to `1023.5TiB`
 *
 * Units are the binary ones defined by IEC, named kibibyte (`KiB`, 1024 bytes),
 * mebibyte (`MiB`), gibibyte (`GiB`), and tebibyte (`TiB`), each 1024 times the
 * previous. Memory, storage quotas, and caches are measured in them. The
 * familiar `MB` is ambiguous: SI defines it as a million bytes, storage vendors
 * use that meaning, and most software uses 1048576 instead, which is why a "1
 * TB" drive shows as 931 "GB". `MiB` has only one meaning, so a literal never
 * depends on a convention.
 *
 * Each unit is bounded below 1024, so equivalent representations are avoided:
 * `1024KiB` must be written as `"1MiB"`. A half is the only decimal allowed,
 * because it is the only single decimal digit that is exact in every binary
 * unit; `1.1KiB` would be 1126.4 bytes. For other exact values, use
 * {@link ByteLength} directly.
 *
 * See {@link ByteSize} for a type that also accepts {@link ByteLength}. Use
 * {@link byteSizeToByteLength} to convert.
 *
 * Invalid values produce a {@link ByteSizeLiteralError}.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertErr,
 *   assertFalse,
 *   assertOk,
 *   assertType,
 *   ByteSizeLiteral,
 * } from "@evolu/common";
 *
 * // The TypeScript type accepts valid spellings and rejects the rest.
 * const literal: ByteSizeLiteral = "1023MiB";
 * assertType<
 *   Extract<ByteSizeLiteral, "1024KiB" | "1.1KiB" | "1MB">,
 *   never
 * >();
 *
 * // The runtime Type validates the same grammar.
 * assertOk(ByteSizeLiteral.fromUnknown(literal), "1023MiB");
 * assertFalse(ByteSizeLiteral.is("1024KiB"));
 *
 * const invalid = ByteSizeLiteral.fromUnknown("1MB");
 * assertErr(invalid);
 * assertEqual(invalid.error.type, "ByteSizeLiteral");
 * assertEqual(
 *   ByteSizeLiteral.formatError(invalid.error),
 *   'The value "1MB" is not a byte-size literal. Use a value such as "512KiB" or "1MiB".',
 * );
 * ```
 */
export const ByteSizeLiteral: Type<
  "ByteSizeLiteral",
  ByteSizeLiteral,
  ByteSizeLiteral,
  ByteSizeLiteralError
> = /*#__PURE__*/ createTypeWithError(
  "ByteSizeLiteral",
  byteSizeLiteralSyntax,
  (cause, value): ByteSizeLiteralError => ({
    type: "ByteSizeLiteral",
    value,
    cause,
  }),
  (error) =>
    `The value ${safelyStringifyUnknownValue(error.value)} is not a byte-size literal. Use a value such as "512KiB" or "1MiB".`,
);

/** Error returned when {@link ByteSizeLiteral} rejects a value. */
export interface ByteSizeLiteralError extends TypeError<"ByteSizeLiteral"> {
  readonly value: unknown;
  /**
   * The underlying union failure, retained for diagnostics.
   *
   * With `{ errors: "all" }`, includes every failed alternative.
   */
  readonly cause: UnionError;
}

/**
 * {@link ByteSizeLiteral} or {@link ByteLength}.
 *
 * Convenience input accepting a human-readable {@link ByteSizeLiteral} or a
 * validated {@link ByteLength} for values that no literal expresses. APIs
 * normalize it with {@link byteSizeToByteLength}.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   ByteLength,
 *   byteSizeToByteLength,
 *   type ByteSize,
 * } from "@evolu/common";
 *
 * const literal: ByteSize = "1MiB";
 * const validated: ByteSize = ByteLength.orThrow(1000000);
 *
 * assertEqual(byteSizeToByteLength(literal), 1048576);
 * assertEqual(byteSizeToByteLength(validated), 1000000);
 * ```
 */
export type ByteSize = ByteSizeLiteral | ByteLength;

const bytesByByteLengthUnit = {
  B: 1,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
  TiB: 1024 ** 4,
};

/**
 * Converts a {@link ByteSize} to a {@link ByteLength}. A {@link ByteLength} is
 * returned unchanged.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, byteSizeToByteLength } from "@evolu/common";
 *
 * assertEqual(byteSizeToByteLength("0B"), 0);
 * assertEqual(byteSizeToByteLength("2KiB"), 2048);
 * assertEqual(byteSizeToByteLength("1GiB"), 1073741824);
 * ```
 */
export const byteSizeToByteLength = (value: ByteSize): ByteLength => {
  if (typeof value === "number") return value;

  const unit = value.endsWith("iB") ? value.slice(-3) : "B";
  assert(unit in bytesByByteLengthUnit, `Unknown byte length unit: ${unit}`);

  return ByteLength.orThrow(
    Number.parseFloat(value) *
      bytesByByteLengthUnit[unit as keyof typeof bytesByByteLengthUnit],
  );
};

/**
 * Error returned when a string is neither a number of bytes nor a
 * {@link ByteSizeLiteral}.
 */
export interface ByteLengthFromStringError extends TypeError<"ByteLengthFromString"> {
  readonly value: string;
}

/**
 * Transforms a number of bytes or a {@link ByteSizeLiteral} in text into a
 * {@link ByteLength}.
 *
 * This is useful for inputs that carry sizes as text, such as environment
 * variables and configuration files, where `"10MiB"` reads better than
 * `"10485760"`. Encoding produces the number of bytes.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertErr,
 *   assertOk,
 *   ByteLengthFromString,
 * } from "@evolu/common";
 *
 * assertOk(ByteLengthFromString.fromUnknown("10MiB"), 10485760);
 * assertOk(ByteLengthFromString.fromUnknown("1048576"), 1048576);
 * assertEqual(
 *   ByteLengthFromString.to(ByteLengthFromString.orThrow("1KiB")),
 *   "1024",
 * );
 *
 * const invalid = ByteLengthFromString.fromUnknown("10MB");
 * assertErr(invalid, { type: "ByteLengthFromString", value: "10MB" });
 * assertEqual(
 *   ByteLengthFromString.formatError(invalid.error),
 *   'The value "10MB" is not a byte length. Use a number of bytes or a literal such as 10MiB.',
 * );
 * ```
 */
export const ByteLengthFromString = /*#__PURE__*/ transform(
  "ByteLengthFromString",
  String,
  ByteLength,
  {
    from: (value): Result<number, ByteLengthFromStringError> => {
      if (ByteSizeLiteral.is(value)) return ok(byteSizeToByteLength(value));
      if (/^\d+$/u.test(value)) {
        const number = Number(value);
        if (Number.isSafeInteger(number)) return ok(number);
      }
      return err({ type: "ByteLengthFromString", value });
    },
    to: (value) => globalThis.String(value),
  },
  (error) =>
    `The value ${safelyStringifyUnknownValue(error.value)} is not a byte length. Use a number of bytes or a literal such as 10MiB.`,
);
