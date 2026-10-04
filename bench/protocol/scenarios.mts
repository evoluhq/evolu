/**
 * Datasets and sync scenarios shared by the protocol benchmarks.
 *
 * A seeded PRNG owned by the harness generates every input, so a dependency
 * upgrade cannot shift them, and the harness hashes inputs itself rather than
 * through Evolu. Evolu modules are passed in, because each child process loads
 * them from its own source root. This module statically imports only Node.js
 * modules and erased types.
 */
import { createHash } from "node:crypto";
import type { NonEmptyReadonlyArray, RandomBytes } from "@evolu/common";
import type {
  CrdtMessage,
  EncryptedDbChange,
  Timestamp,
} from "@evolu/common/local-first";
import type { Modules } from "./child.mts";

/** The Evolu modules scenarios are created with. */
export type ScenarioModules = Pick<Modules, "common" | "localFirst">;

export interface SyncScenario {
  /** `<shape>-<size>[-<rangesMaxSize>]`. */
  readonly name: string;
  /** The client's rows, including pushed ones. */
  readonly client: ReadonlyArray<Row>;
  readonly relay: ReadonlyArray<Row>;
  readonly rangesMaxSize: number | null;
  /** Keys of changes too large to sync; only the side that has them keeps them. */
  readonly heldBack: ReadonlySet<string>;
  readonly push: Push | null;
}

/** CRDT messages the client already stores and pushes in its first request. */
export interface Push {
  readonly crdtMessages: NonEmptyReadonlyArray<CrdtMessage>;
  /**
   * The seed of the nonces that encrypted the client's copies. The push gets
   * the same nonce stream, so it reproduces the stored bytes.
   */
  readonly encryptionSeed: number;
}

export interface Row {
  readonly timestamp: Timestamp;
  /** The timestamp bytes in hex, which sort like the bytes. */
  readonly key: string;
  /** The length of a generated change, or a pushed change. */
  readonly change: number | PushedChange;
}

/**
 * The harness inputs of a pushed row, which the workload descriptor hashes, and
 * the change Evolu encoded and encrypted from them, which verification compares
 * with the stored bytes.
 */
export interface PushedChange {
  readonly id: string;
  readonly title: string;
  readonly encrypted: EncryptedDbChange;
}

/**
 * The rows one side stores before sync.
 *
 * A pushed change is described by its harness inputs, not by the bytes Evolu
 * encodes and encrypts from them, so a descriptor never depends on the code
 * under test. An encoding change shows up as a cost and frame change instead.
 */
export interface SideWorkload {
  readonly rows: number;
  /** The bytes of generated changes plus the id and title bytes of pushed ones. */
  readonly changeBytes: number;
  /**
   * The first 16 hex digits of a SHA-256 over the rows in timestamp order, each
   * as its timestamp bytes followed by the length and bytes of each input: a
   * generated change, or a pushed change's id and title.
   */
  readonly sha256: string;
}

export const createScenarios = (
  modules: ScenarioModules,
): ReadonlyArray<SyncScenario> => {
  const { localFirst } = modules;
  const createTimestamp = createTimestampFactory(modules);

  /** Replaces change lengths at evenly spaced positions. */
  const withLengths = (
    rows: ReadonlyArray<Row>,
    lengths: ReadonlyArray<number>,
  ): Array<Row> => {
    const result = [...rows];
    lengths.forEach((length, index) => {
      const position = Math.floor(
        ((index + 1) * rows.length) / (lengths.length + 1),
      );
      result[position] = { ...result[position], change: length };
    });
    return result;
  };

  /** Ids are 16 PRNG bytes in Base64Url, encoded by Node.js. */
  const createPush = (
    seed: number,
    count: number,
    afterMillis: number,
  ): { readonly push: Push; readonly rows: ReadonlyArray<Row> } => {
    const next = createPrng(seed);
    const idRandomBytes = createSeededRandomBytes(seed + 1);
    const encryptionSeed = seed + 2;
    const encrypt = localFirst.encodeAndEncryptDbChange({
      randomBytes: createSeededRandomBytes(encryptionSeed),
    });
    const crdtMessages: Array<CrdtMessage> = [];
    const rows: Array<Row> = [];
    for (let index = 0; index < count; index++) {
      const id = Buffer.from(idRandomBytes.create(16)).toString("base64url");
      const title = "x".repeat(20 + Math.floor(next() * 200));
      const message: CrdtMessage = {
        timestamp: createTimestamp(
          afterMillis + 1_000 + Math.floor(index / 10),
          index % 10,
          "00000000000000ff",
        ),
        change: localFirst.DbChange.orThrow({
          table: "todo",
          id,
          values: { title },
          isInsert: true,
          isDelete: null,
        }),
      };
      crdtMessages.push(message);
      rows.push(
        createRow(message.timestamp, {
          id,
          title,
          encrypted: encrypt(message, localFirst.testAppOwner.encryptionKey),
        }),
      );
    }
    if (!isNonEmpty(crdtMessages)) throw new Error("A push needs messages.");
    return { push: { crdtMessages, encryptionSeed }, rows };
  };

  const typical100k = createTypicalRows(modules, 1, 100_000);
  const typical20k = typical100k.slice(0, 20_000);
  const lastMillisOf = (rows: ReadonlyArray<Row>) => {
    const last = rows.at(-1);
    if (last === undefined) throw new Error("The dataset is empty.");
    return last.timestamp.millis;
  };

  const createTail = (nodeId: string, offsetMillis: number) =>
    Array.from({ length: 50 }, (_, index) =>
      createRow(
        createTimestamp(
          lastMillisOf(typical100k) + 60_000 * (index + 1) + offsetMillis,
          0,
          nodeId,
        ),
        150 + index,
      ),
    );

  const scattered = shuffle(
    7,
    typical100k.map((_, index) => index),
  ).slice(0, 200);
  const clientLacks = new Set(scattered.slice(0, 100));
  const relayLacks = new Set(scattered.slice(100));
  const scatteredClient = typical100k.filter(
    (_, index) => !clientLacks.has(index),
  );
  const scatteredRelay = typical100k.filter(
    (_, index) => !relayLacks.has(index),
  );

  const halves20k = shuffle(3, typical20k);

  // Nearly the widest timestamp encoding, as in Protocol.test.ts.
  const nextWideLength = createPrng(4);
  const wideHalves5k = shuffle(
    5,
    Array.from({ length: 5_000 }, (_, index) =>
      createRow(
        createTimestamp(
          (index + 1) * 2 ** 35,
          16_384 + (index % 40_000),
          (index + 1).toString(16).padStart(16, "0"),
        ),
        100 + Math.floor(nextWideLength() * 100),
      ),
    ),
  );

  const small = createTypicalRows(modules, 11, 2_000);
  const largeChanges = withLengths(small, [
    largestMutationChangeLength,
    legacyChangeLengths[0],
    legacyChangeLengths[1],
    largestMutationChangeLength,
    legacyChangeLengths[0],
    legacyChangeLengths[1],
  ]);
  const oversizedChange = withLengths(small, [oversizedChangeLength]);
  const oversizedRow = oversizedChange[1_000];

  const push100 = createPush(31, 100, lastMillisOf(typical20k));
  const push5k = createPush(32, 5_000, lastMillisOf(typical20k));

  const scenario = ({
    name,
    client,
    relay,
    rangesMaxSize = null,
    heldBack = new Set<string>(),
    push = null,
  }: {
    name: string;
    client: ReadonlyArray<Row>;
    relay: ReadonlyArray<Row>;
    rangesMaxSize?: number | null;
    heldBack?: ReadonlySet<string>;
    push?: Push | null;
  }): SyncScenario => ({ name, client, relay, rangesMaxSize, heldBack, push });

  return [
    // Reconciliation depth on 100k typical rows.
    scenario({ name: "in-sync-100k", client: typical100k, relay: typical100k }),
    scenario({
      name: "single-difference-100k",
      client: typical100k.filter((_, index) => index !== 50_000),
      relay: typical100k,
    }),
    scenario({
      name: "tail-100k",
      client: [...typical100k, ...createTail("00000000000000c1", 0)],
      relay: [...typical100k, ...createTail("00000000000000d2", 30_000)],
    }),
    ...rangesMaxSizes.map((rangesMaxSize) =>
      scenario({
        name: `scattered-100k-${rangesMaxSize}`,
        client: scatteredClient,
        relay: scatteredRelay,
        rangesMaxSize,
      }),
    ),

    // Bulk transfer on 20k rows.
    scenario({ name: "download-20k", client: [], relay: typical20k }),
    scenario({ name: "upload-20k", client: typical20k, relay: [] }),
    ...rangesMaxSizes.map((rangesMaxSize) =>
      scenario({
        name: `random-halves-20k-${rangesMaxSize}`,
        client: halves20k.slice(0, 10_000),
        relay: halves20k.slice(10_000),
        rangesMaxSize,
      }),
    ),

    // Encoding width.
    ...rangesMaxSizes.map((rangesMaxSize) =>
      scenario({
        name: `wide-halves-5k-${rangesMaxSize}`,
        client: wideHalves5k.slice(0, 2_500),
        relay: wideHalves5k.slice(2_500),
        rangesMaxSize,
      }),
    ),

    // Large changes.
    scenario({
      name: "large-changes-download",
      client: [],
      relay: largeChanges,
    }),
    scenario({ name: "large-changes-upload", client: largeChanges, relay: [] }),
    scenario({
      name: "oversized-change-upload",
      client: oversizedChange,
      relay: [],
      heldBack: new Set([oversizedRow.key]),
    }),

    // Relay upload batches.
    scenario({
      name: "push-100-into-20k",
      client: [...typical20k, ...push100.rows],
      relay: typical20k,
      push: push100.push,
    }),
    // The push overflows the request, so sync continues.
    scenario({
      name: "push-5k-into-20k",
      client: [...typical20k, ...push5k.rows],
      relay: typical20k,
      push: push5k.push,
    }),
  ];
};

const rangesMaxSizes = [3_000, 30_000, 100_000] as const;

/** The largest PADMÉ-padded change within `maxMutationSize`. */
const largestMutationChangeLength = 655_403;

/** PADMÉ-padded lengths of legacy changes that still fit a message. */
const legacyChangeLengths = [983_083, 999_467] as const;

/** A PADMÉ-padded length that fits no message. */
const oversizedChangeLength = 1_015_851;

/** Creates timestamps validated by the loaded Evolu Types. */
export const createTimestampFactory =
  ({ common, localFirst }: ScenarioModules) =>
  (millis: number, counter: number, nodeId: string): Timestamp => ({
    millis: common.Millis.orThrow(millis),
    counter: localFirst.Counter.orThrow(counter),
    nodeId: localFirst.NodeId.orThrow(nodeId),
  });

/**
 * A multi-device history: each row starts a new batch with probability 0.3,
 * otherwise it shares the batch's millis with the next counter, and with
 * probability 0.2, a new batch picks one of four devices at random. Change
 * lengths are 100–199 bytes for 70% of rows, 200–999 for 25%, and 1,000–9,999
 * for 5%.
 */
export const createTypicalRows = (
  modules: ScenarioModules,
  seed: number,
  count: number,
): Array<Row> => {
  const createTimestamp = createTimestampFactory(modules);
  const next = createPrng(seed);
  const devices = [0, 1, 2, 3].map((index) =>
    (0x1000 + index * 0x1111).toString(16).padStart(16, "0"),
  );
  const rows: Array<Row> = [];
  let millis = 1_700_000_000_000;
  let counter = 0;
  let device = 0;
  for (let index = 0; index < count; index++) {
    if (index === 0 || next() < 0.3) {
      millis += 1 + Math.floor(next() * 600_000);
      counter = 0;
      if (next() < 0.2) device = Math.floor(next() * devices.length);
    } else {
      counter++;
    }
    const lengthClass = next();
    const length =
      lengthClass < 0.7
        ? 100 + Math.floor(next() * 100)
        : lengthClass < 0.95
          ? 200 + Math.floor(next() * 800)
          : 1_000 + Math.floor(next() * 9_000);
    rows.push(
      createRow(createTimestamp(millis, counter, devices[device]), length),
    );
  }
  return rows;
};

const createRow = (timestamp: Timestamp, change: Row["change"]): Row => ({
  timestamp,
  key: timestampToKey(timestamp),
  change,
});

/** Mulberry32: integer arithmetic plus one exact division by 2^32. */
export const createPrng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const shuffle = <T,>(
  seed: number,
  items: ReadonlyArray<T>,
): Array<T> => {
  const next = createPrng(seed);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(next() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};

export const createSeededRandomBytes = (seed: number): RandomBytes => {
  const next = createPrng(seed);
  // RandomBytes types results by length; Evolu's implementations cast too.
  return {
    create: (bytesLength: number) =>
      Uint8Array.from({ length: bytesLength }, () => Math.floor(next() * 256)),
  } as RandomBytes;
};

/** Encodes a timestamp as Evolu's 16 timestamp bytes, in hex. */
export const timestampToKey = ({
  millis,
  counter,
  nodeId,
}: Timestamp): string => {
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(millis, 0, 6);
  bytes.writeUInt16BE(counter, 6);
  bytes.write(nodeId, 8, "hex");
  return bytes.toString("hex");
};

/**
 * A generated change is the row's timestamp bytes followed by zeros, so a
 * change delivered under the wrong timestamp fails the byte comparison.
 */
export const changeOfRow = (row: Row): Uint8Array => {
  if (typeof row.change !== "number") return row.change.encrypted;
  const change = new Uint8Array(row.change);
  change.set(Buffer.from(row.key, "hex"));
  return change;
};

export const isNonEmpty = <T,>(
  array: ReadonlyArray<T>,
): array is NonEmptyReadonlyArray<T> => array.length > 0;

export const sortRows = (rows: ReadonlyArray<Row>): ReadonlyArray<Row> =>
  rows.toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

export const describeSide = (sortedRows: ReadonlyArray<Row>): SideWorkload => {
  const hash = createHash("sha256");
  const length = Buffer.alloc(4);
  let changeBytes = 0;
  for (const row of sortedRows) {
    hash.update(Buffer.from(row.key, "hex"));
    const inputs =
      typeof row.change === "number"
        ? [changeOfRow(row)]
        : [Buffer.from(row.change.id), Buffer.from(row.change.title)];
    for (const input of inputs) {
      length.writeUInt32BE(input.length);
      hash.update(length).update(input);
      changeBytes += input.length;
    }
  }
  return {
    rows: sortedRows.length,
    changeBytes,
    sha256: hash.digest("hex").slice(0, 16),
  };
};
