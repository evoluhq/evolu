/**
 * Binary data handling and byte array utilities.
 *
 * @module
 */

import type { Result } from "./Result.ts";
import type { NonNegativeInt } from "./Type.ts";
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
 * append serialized data and use `decode*` functions to extract data. Both
 * `shift` and `shiftN` throw an {@link BufferError} with message "Buffer parse
 * ended prematurely" on failure, as do higher-level `decode*` functions,
 * providing stack traces for debugging instead of using {@link Result}. This
 * avoids allocation overhead in success cases and leverages exceptions'
 * diagnostic benefits.
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

    unwrap: () => value.subarray(0, length),
  };

  return buffer;
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
