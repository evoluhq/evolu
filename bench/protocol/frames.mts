/**
 * An independent reader of protocol v1 frames shared by the protocol
 * benchmarks. It statically imports only erased types.
 */
import type { NonNegativeInt } from "@evolu/common";
import type { Modules } from "./child.mts";

export interface ParsedFrame {
  readonly messageType: number;
  /** The error code of a response, or null for other message types. */
  readonly errorCode: number | null;
  readonly messages: number;
  readonly changeBytes: number;
  readonly rangesBytes: number;
  readonly skipRanges: number;
  readonly fingerprintRanges: number;
  readonly timestampsRanges: number;
  readonly listedTimestamps: number;
}

/**
 * Parses a protocol v1 frame with the exported Bytes decoders only, so it
 * shares no decoding code with Protocol.ts. It throws on an unknown type and on
 * bytes left over.
 */
export const createFrameParser =
  ({ common }: Pick<Modules, "common">) =>
  (frame: Uint8Array): ParsedFrame => {
    const { createBuffer, decodeLength, decodeNonNegativeInt, decodeRle } =
      common;
    const buffer = createBuffer(frame);
    // Millis deltas, then run-length encoded counters and NodeIds.
    const skipTimestamps = (length: NonNegativeInt) => {
      for (let index = 0; index < length; index++) decodeNonNegativeInt(buffer);
      decodeRle(buffer, length, () => decodeNonNegativeInt(buffer));
      decodeRle(buffer, length, () => {
        buffer.shiftN(nodeIdBytesLength);
      });
    };

    // The version, the OwnerId, and the message type.
    decodeNonNegativeInt(buffer);
    buffer.shiftN(ownerIdBytesLength);
    const messageType = buffer.shift();
    let errorCode: number | null = null;
    if (messageType === requestMessageType) {
      // An optional write key, then the subscription flag.
      if (buffer.shift() === 1) buffer.shiftN(writeKeyLength);
      buffer.shift();
    } else if (messageType === responseMessageType) {
      errorCode = buffer.shift();
    } else if (messageType !== broadcastMessageType) {
      throw new Error(`Unknown message type ${messageType}`);
    }

    const messages = decodeNonNegativeInt(buffer);
    skipTimestamps(messages);
    let changeBytes = 0;
    for (let index = 0; index < messages; index++) {
      const length = decodeLength(buffer);
      buffer.shiftN(length);
      changeBytes += length;
    }

    const rangesBytes = buffer.getLength();
    let skipRanges = 0;
    let fingerprintRanges = 0;
    let timestampsRanges = 0;
    let listedTimestamps = 0;
    if (rangesBytes > 0) {
      const rangesCount = decodeNonNegativeInt(buffer);
      // Upper bounds of every range but the last, which is infinite.
      if (rangesCount > 0) skipTimestamps((rangesCount - 1) as NonNegativeInt);
      const rangeTypes = Array.from({ length: rangesCount }, () =>
        decodeNonNegativeInt(buffer),
      );
      for (const rangeType of rangeTypes) {
        switch (rangeType) {
          case skipRangeType:
            skipRanges++;
            break;
          case fingerprintRangeType:
            fingerprintRanges++;
            buffer.shiftN(fingerprintLength);
            break;
          case timestampsRangeType: {
            timestampsRanges++;
            const listed = decodeNonNegativeInt(buffer);
            listedTimestamps += listed;
            skipTimestamps(listed);
            break;
          }
          default:
            throw new Error(`Unknown range type ${rangeType}`);
        }
      }
    }
    if (buffer.getLength() !== 0) {
      throw new Error(`${buffer.getLength()} bytes are left over`);
    }

    return {
      messageType,
      errorCode,
      messages,
      changeBytes,
      rangesBytes,
      skipRanges,
      fingerprintRanges,
      timestampsRanges,
      listedTimestamps,
    };
  };

// Protocol v1 wire constants, kept here so a format change fails the parser.
export const requestMessageType = 0;
export const responseMessageType = 1;
export const broadcastMessageType = 2;
export const skipRangeType = 0;
export const fingerprintRangeType = 1;
export const timestampsRangeType = 2;
export const ownerIdBytesLength = 16 as NonNegativeInt;
export const writeKeyLength = 16 as NonNegativeInt;
export const nodeIdBytesLength = 8 as NonNegativeInt;
export const fingerprintLength = 12 as NonNegativeInt;
