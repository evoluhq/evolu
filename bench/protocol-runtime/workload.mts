/**
 * Cases, inputs, and hand-encoded requests of the protocol runtime benchmark.
 *
 * Requests are encoded here, without Evolu, so every version receives the same
 * bytes. This module statically imports only Node.js modules and erased types,
 * so a child process can import it before choosing a source root.
 */
import {
  fingerprintLength,
  fingerprintRangeType,
  requestMessageType,
  skipRangeType,
  timestampsRangeType,
} from "../protocol/frames.mts";
import { createPrng } from "../protocol/scenarios.mts";
import type { Work } from "./timing.mts";

/**
 * Reconcile scenarios of the protocol benchmark that this benchmark times, by
 * their names there.
 */
export const reconcileScenarioNames = [
  "single-difference-100k",
  "download-20k",
  "upload-20k",
  "random-halves-20k-30000",
  "random-halves-20k-3000",
  "wide-halves-5k-30000",
  "large-changes-download",
  "push-5k-into-20k",
] as const;
export type ReconcileScenarioName = (typeof reconcileScenarioNames)[number];

export const microNames = [
  "encrypt-1000",
  "decrypt-1000",
  "timestamps-buffer-5000",
  "upload-builder-5000",
  "broadcast-builder-5000",
  "relay-max-skip-ranges",
  "relay-max-timestamps-range",
  "relay-messages-without-write-key",
] as const;
export type MicroName = (typeof microNames)[number];

export const caseNames = [...reconcileScenarioNames, ...microNames] as const;
export type CaseName = (typeof caseNames)[number];

export const isReconcileScenarioName = (
  name: string,
): name is ReconcileScenarioName =>
  (reconcileScenarioNames as ReadonlyArray<string>).includes(name);

export const isMicroName = (name: string): name is MicroName =>
  (microNames as ReadonlyArray<string>).includes(name);

/** What one child process measured for one case. */
export interface CaseResult {
  readonly name: string;
  /** A SHA-256 of the case's inputs, computed by the harness. */
  readonly workloadSha256: string;
  /** Null for micro benchmarks, which use no SQLite. */
  readonly sqliteVersion: string | null;
  readonly work: Work;
  /** Gated metrics: the fastest thread CPU time of each, in nanoseconds. */
  readonly cpuNs: Metrics;
  /** Metrics that are reported but never gated. */
  readonly reportedCpuNs: Metrics;
  /** The fastest wall time of every metric above. */
  readonly wallNs: Metrics;
  /** Measured passes or calls. */
  readonly passes: number;
  readonly maxRssKiB: number;
}

/** Nanoseconds by metric name. */
export type Metrics = Readonly<Partial<Record<string, number>>>;

/** Both peers' default frame size limit. */
export const maxFrameBytes = 1_000_000;

/** The largest ranges section a relay accepts. */
export const maxRangesSectionBytes = 200_000;

/** A change of one generated CRDT message. */
export interface ChangeInput {
  /** 16 PRNG bytes in Base64Url. */
  readonly id: string;
  readonly title: string;
  readonly millis: number;
  readonly counter: number;
  readonly nodeId: string;
}

/**
 * Generates `count` todo inserts from one device with titles of 1 to 500
 * lowercase letters, ten per millisecond.
 */
export const createChangeInputs = (
  seed: number,
  count: number,
): ReadonlyArray<ChangeInput> => {
  const next = createPrng(seed);
  return Array.from({ length: count }, (_, index) => {
    const id = Buffer.from(
      Uint8Array.from({ length: 16 }, () => Math.floor(next() * 256)),
    ).toString("base64url");
    const title = String.fromCharCode(
      ...Array.from(
        { length: 1 + Math.floor(next() * 500) },
        () => 97 + Math.floor(next() * 26),
      ),
    );
    return {
      id,
      title,
      millis: 1_700_000_000_000 + Math.floor(index / 10),
      counter: index % 10,
      nodeId: "00000000000000a1",
    };
  });
};

export interface TimestampInput {
  readonly millis: number;
  readonly counter: number;
  /** 16 hex digits. */
  readonly nodeId: string;
}

/** Ascending timestamps one millisecond apart from one device. */
export const createAscendingTimestamps = (
  count: number,
): ReadonlyArray<TimestampInput> =>
  Array.from({ length: count }, (_, index) => ({
    millis: 1_700_000_000_000 + index,
    counter: 0,
    nodeId: "00000000000000b2",
  }));

/** A growable byte writer with the protocol's variable-length integers. */
export interface FrameWriter {
  readonly byte: (value: number) => void;
  readonly bytes: (values: Uint8Array) => void;
  /** The variable-length quantity of `encodeNonNegativeInt`. */
  readonly varint: (value: number) => void;
  /**
   * Writes a timestamps count, millis deltas, and run-length encoded counters
   * and NodeIds, as a `TimestampsBuffer` appends them. `count` exceeds the
   * timestamps for range upper bounds, whose last range is infinite.
   */
  readonly timestamps: (
    timestamps: ReadonlyArray<TimestampInput>,
    count?: number,
  ) => void;
  readonly getLength: () => number;
  readonly unwrap: () => Uint8Array;
}

export const createFrameWriter = (): FrameWriter => {
  let buffer = new Uint8Array(1_024);
  let length = 0;

  const reserve = (additional: number) => {
    if (length + additional <= buffer.length) return;
    const grown = new Uint8Array(
      Math.max(length + additional, buffer.length * 2),
    );
    grown.set(buffer.subarray(0, length));
    buffer = grown;
  };

  const byte = (value: number) => {
    reserve(1);
    buffer[length++] = value;
  };

  const bytes = (values: Uint8Array) => {
    reserve(values.length);
    buffer.set(values, length);
    length += values.length;
  };

  const varint = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Cannot encode ${value} as a non-negative integer.`);
    }
    let remaining = value;
    while (remaining >= 128) {
      byte((remaining % 128) | 128);
      remaining = Math.floor(remaining / 128);
    }
    byte(remaining);
  };

  const runs = <T,>(values: ReadonlyArray<T>, write: (value: T) => void) => {
    let index = 0;
    while (index < values.length) {
      let end = index + 1;
      while (end < values.length && values[end] === values[index]) end++;
      write(values[index]);
      varint(end - index);
      index = end;
    }
  };

  return {
    byte,
    bytes,
    varint,
    timestamps: (timestamps, count = timestamps.length) => {
      varint(count);
      let previousMillis = 0;
      for (const { millis } of timestamps) {
        varint(millis - previousMillis);
        previousMillis = millis;
      }
      runs(
        timestamps.map(({ counter }) => counter),
        varint,
      );
      runs(
        timestamps.map(({ nodeId }) => nodeId),
        (nodeId) => {
          bytes(Buffer.from(nodeId, "hex"));
        },
      );
    },
    getLength: () => length,
    unwrap: () => buffer.slice(0, length),
  };
};

/**
 * A request header without a write key or a subscription change, then no
 * messages.
 */
const writeRequestHeader = (writer: FrameWriter, ownerIdBytes: Uint8Array) => {
  writer.varint(protocolVersion);
  writer.bytes(ownerIdBytes);
  writer.byte(requestMessageType);
  writer.byte(0);
  writer.byte(subscriptionNone);
};

/**
 * The largest ranges section a relay accepts made of Skip ranges, whose upper
 * bounds are one millisecond apart.
 */
export const createMaxSkipRangesRequest = (
  ownerIdBytes: Uint8Array,
): Uint8Array =>
  // Each range takes at least its type byte and a 1-byte millis delta.
  largestWithin(
    maxRangesSectionBytes,
    maxRangesSectionBytes / 2,
    (rangesCount) => {
      const writer = createFrameWriter();
      writeRequestHeader(writer, ownerIdBytes);
      writer.varint(0);
      const headerLength = writer.getLength();
      writer.timestamps(
        createAscendingTimestamps(rangesCount - 1),
        rangesCount,
      );
      for (let index = 0; index < rangesCount; index++) {
        writer.varint(skipRangeType);
      }
      return {
        frame: writer.unwrap(),
        size: writer.getLength() - headerLength,
      };
    },
  );

/**
 * The largest ranges section a relay accepts holding one Timestamps range,
 * which lists timestamps one millisecond apart.
 */
export const createMaxTimestampsRangeRequest = (
  ownerIdBytes: Uint8Array,
): Uint8Array =>
  // Each listed timestamp takes at least a 1-byte millis delta.
  largestWithin(maxRangesSectionBytes, maxRangesSectionBytes, (listed) => {
    const writer = createFrameWriter();
    writeRequestHeader(writer, ownerIdBytes);
    writer.varint(0);
    const headerLength = writer.getLength();
    writer.timestamps([], 1);
    writer.varint(timestampsRangeType);
    writer.timestamps(createAscendingTimestamps(listed));
    return { frame: writer.unwrap(), size: writer.getLength() - headerLength };
  });

/**
 * The largest request within {@link maxFrameBytes} holding messages with 200 to
 * 499 byte changes but no write key, closed by one Fingerprint range.
 */
export const createMessagesWithoutWriteKeyRequest = (
  ownerIdBytes: Uint8Array,
): Uint8Array => {
  const next = createPrng(41);
  const changes: Array<Uint8Array> = [];
  return largestWithin(maxFrameBytes, maxFrameBytes / 200, (messages) => {
    while (changes.length < messages) {
      changes.push(
        Uint8Array.from({ length: 200 + Math.floor(next() * 300) }, () =>
          Math.floor(next() * 256),
        ),
      );
    }
    const writer = createFrameWriter();
    writeRequestHeader(writer, ownerIdBytes);
    writer.timestamps(createAscendingTimestamps(messages));
    for (const change of changes.slice(0, messages)) {
      writer.varint(change.length);
      writer.bytes(change);
    }
    writer.timestamps([], 1);
    writer.varint(fingerprintRangeType);
    writer.bytes(new Uint8Array(fingerprintLength));
    return { frame: writer.unwrap(), size: writer.getLength() };
  });
};

/**
 * Finds the largest count up to `maxCount` whose built size is within `limit`,
 * by bisection, so the size must grow with the count.
 */
const largestWithin = (
  limit: number,
  maxCount: number,
  build: (count: number) => {
    readonly frame: Uint8Array;
    readonly size: number;
  },
): Uint8Array => {
  let low = 1;
  let high = maxCount;
  if (build(low).size > limit) throw new Error("Nothing fits the limit.");
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (build(middle).size <= limit) low = middle;
    else high = middle - 1;
  }
  return build(low).frame;
};

// Protocol v1 wire constants frames.mts does not export, kept here so a format
// change fails verification.
const protocolVersion = 1;
const subscriptionNone = 0;
