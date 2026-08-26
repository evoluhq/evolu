/**
 * Binary data handling and byte array utilities.
 *
 * Buffer-based decoding functions intentionally throw errors instead of
 * returning {@link Result}. This is a deliberate micro-optimization for Evolu
 * Protocol's hot paths: Result is inexpensive, but returning decoded values
 * directly avoids its success-case allocation, and using `Error` objects
 * preserves stack traces. In the future, we will try returning `Error` objects
 * in `Result` values to measure the real-world performance impact.
 *
 * @module
 */

import type { Result } from "./Result.ts";
import type { JsonValue, NonNegativeInt } from "./Type.ts";
export {
  bytesToHex,
  bytesToUtf8,
  concatBytes,
  hexToBytes,
  utf8ToBytes,
} from "@noble/ciphers/utils.js";

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
 *   assert,
 *   assertEqual,
 *   assertErr,
 *   createBuffer,
 *   createIdFromString,
 *   IdBytes,
 *   idBytesToId,
 *   idBytesTypeValueLength,
 *   idToIdBytes,
 *   NonNegativeInt,
 *   trySync,
 * } from "@evolu/common";
 * import {
 *   decodeNonNegativeInt,
 *   encodeNonNegativeInt,
 * } from "@evolu/common/local-first";
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
 * assert(
 *   result.error instanceof Error &&
 *     result.error.message === "Buffer parse ended prematurely",
 *   "Expected the premature-buffer-end error.",
 * );
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
  assertNonNegativeInt(initialLength, "arrayLike.length");

  let value = arrayLike
    ? new globalThis.Uint8Array(arrayLike)
    : new globalThis.Uint8Array(512);
  let length = initialLength;

  const buffer: Buffer = {
    getCapacity: () => value.length as NonNegativeInt,

    getLength: () => length,

    extend: (arg) => {
      const argLength = arg.length;
      assertNonNegativeInt(argLength, "arg.length");

      const targetSize = length + argLength;
      assertNonNegativeInt(targetSize, "Buffer length");

      if (value.length < targetSize) {
        const oldValue = value;
        const newCapacity = Math.max(value.length * 2, targetSize);
        value = new globalThis.Uint8Array(newCapacity);
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
let jsonEncoderTarget = new globalThis.Uint8Array(8192);
let jsonEncoderTargetView = new globalThis.DataView(jsonEncoderTarget.buffer);
let jsonEncoderPosition = 0;
let jsonEncoderDepth = 0;
let jsonEncoderIsActive = false;
const emptyJsonDecoderSource: Uint8Array = new globalThis.Uint8Array(0);
const emptyJsonDecoderView: DataView = new globalThis.DataView(
  emptyJsonDecoderSource.buffer,
);
let jsonDecoderSource: Uint8Array = emptyJsonDecoderSource;
let jsonDecoderView: DataView = emptyJsonDecoderView;
let jsonDecoderPosition = 0;
let jsonDecoderDepth = 0;
const jsonStringFromCharCode = globalThis.String.fromCharCode;
// Cache only short keys and use a fixed table to bound retained memory.
const jsonKeyCache: Array<JsonKeyCacheEntry | undefined> =
  globalThis.Array.from({ length: jsonKeyCacheSize }, () => undefined);

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
  jsonDecoderView = new globalThis.DataView(
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
      if (globalThis.Object.is(value, -0)) {
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

      if (
        globalThis.Number.isInteger(value) &&
        value >= -0x80000000 &&
        value < 0
      ) {
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

      if (globalThis.Array.isArray(value)) {
        const array = value as ReadonlyArray<JsonValue>;
        const length = array.length;
        writeJsonCollectionHeader(length, 0x90, 0xdc, 0xdd);

        for (const item of array) encodeJsonValueToTarget(item);
        jsonEncoderDepth--;
        return;
      }

      const object = value as Readonly<Record<string, JsonValue>>;
      const keys = globalThis.Object.keys(object);
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
  assertNonNegativeInt(requiredLength, "Encoded JSON value length");

  if (requiredLength <= jsonEncoderTarget.length) return;

  const newCapacity = globalThis.Math.max(
    jsonEncoderTarget.length * 2,
    requiredLength,
  );
  assertNonNegativeInt(newCapacity, "JSON encoder capacity");

  const oldTarget = jsonEncoderTarget;
  jsonEncoderTarget = new globalThis.Uint8Array(newCapacity);
  jsonEncoderTarget.set(oldTarget.subarray(0, jsonEncoderPosition));
  jsonEncoderTargetView = new globalThis.DataView(jsonEncoderTarget.buffer);
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

  if (!globalThis.Number.isFinite(value)) {
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
      globalThis.Object.defineProperty(value, key, {
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

const assertNonNegativeInt: (
  value: number,
  name: string,
) => asserts value is NonNegativeInt = (value, name) => {
  if (!globalThis.Number.isSafeInteger(value) || value < 0) {
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
