/**
 * Binary data handling and byte array utilities.
 *
 * @module
 */
import type { Result } from "./Result.js";
import { NonNegativeInt } from "./Type.js";
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
 * const buffer = createBuffer();
 * encodeNonNegativeInt(buffer, someInt);
 * encodeId(buffer, someId);
 * const result = buffer.unwrap(); // Final serialized data
 *
 * // Decoding example (throws on error)
 * try {
 *   const num = decodeNonNegativeInt(buffer);
 *   const id = decodeId(buffer);
 * } catch (e) {
 *   console.error(e.stack); // Stack trace for debugging
 * }
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
   * `arg.length` is not a non-negative integer.
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
  let value = arrayLike
    ? new globalThis.Uint8Array(arrayLike)
    : new globalThis.Uint8Array(512);
  let length = NonNegativeInt.orThrow(arrayLike ? arrayLike.length : 0);

  const buffer: Buffer = {
    getCapacity: () => NonNegativeInt.orThrow(value.length),

    getLength: () => length,

    extend: (arg) => {
      const targetSize = length + arg.length;
      if (value.length < targetSize) {
        const oldValue = value;
        const newCapacity = Math.max(value.length * 2, targetSize);
        value = new globalThis.Uint8Array(newCapacity);
        value.set(oldValue);
      }
      value.set(arg, length);
      length = NonNegativeInt.orThrow(length + arg.length);
    },

    shift: () => {
      if (length === 0) {
        throw new BufferError("Buffer parse ended prematurely");
      }
      const first = value[0];
      value = value.subarray(1);
      length--;
      return NonNegativeInt.orThrow(first);
    },

    shiftN: (n) => {
      if (length < n) {
        throw new BufferError("Buffer parse ended prematurely");
      }
      const subarray = value.subarray(0, n);
      value = value.subarray(n);
      length = NonNegativeInt.orThrow(length - n);
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
      length = NonNegativeInt.orThrow(0);
    },

    unwrap: () => value.subarray(0, length),
  };

  return buffer;
};
