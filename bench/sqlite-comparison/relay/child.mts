/**
 * One run of the relay workload in a checkout, which the relay runner starts in
 * a fresh process with `--repo=<checkout>` and an empty working directory. It
 * opens the relay's database as the checkout's relay does, through
 * `createRelayDeps` of its `@evolu/nodejs`, whose driver makes `relay.db` in
 * the working directory, and runs the workload {@link relayWorkload} describes.
 * It prints a {@link RelayRunOutput} as JSON on its last line.
 *
 * It imports Evolu from the checkout, so the same file runs the old code and
 * the new. Their APIs are the same, so it types them with this checkout's.
 *
 * @module
 */
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { relayWorkload, type RelayRunOutput } from "./workload.mts";

// The packages' types, which their declarations share.
type Common = typeof import("@evolu/common");
type LocalFirst = typeof import("@evolu/common/local-first");
type NodeJs = typeof import("@evolu/nodejs");

const { values } = parseArgs({
  options: { repo: { type: "string" } },
  strict: true,
});
if (values.repo == null) throw new Error("The child needs --repo.");
const repoUrl = pathToFileURL(`${values.repo}/`);
const importFrom = <T,>(path: string): Promise<T> =>
  import(new URL(path, repoUrl).href) as Promise<T>;

// As the relay does, before anything that imports Evolu.
const { installPolyfills } = await importFrom<
  typeof import("@evolu/common/polyfills")
>("packages/common/src/Polyfills.ts");
installPolyfills();
const { createRun, createSqlite, Name, NonNegativeInt } =
  await importFrom<Common>("packages/common/src/index.ts");
const {
  createBaseSqliteStorageTables,
  createRelaySqliteStorage,
  createRelayStorageTables,
  createTimestamp,
  ownerIdToOwnerIdBytes,
  testAppOwner,
  timestampToTimestampBytes,
} = await importFrom<LocalFirst>("packages/common/src/local-first/index.ts");
const { createRelayDeps } = await importFrom<NodeJs>(
  "packages/nodejs/src/index.ts",
);

// Seeded, as the protocol benchmark's typical rows: mulberry32.
let seed = 42;
const nextRandom = () => {
  // oxlint-disable-next-line unicorn/prefer-math-trunc -- Wraps to 32 bits, which Math.trunc doesn't.
  seed = (seed + 0x6d_2b_79_f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};

const { messageCount, batchSize, bucketCount, fingerprintRepeats } =
  relayWorkload;
const messages = Array.from({ length: messageCount }, (_, index) => ({
  timestamp: createTimestamp({
    millis: 1_700_000_000_000 + index * 1000,
    counter: 0,
    nodeId: "68a2a7bf3f85a096",
  } as Parameters<typeof createTimestamp>[0]),
  change: new Uint8Array(
    relayWorkload.minChangeBytes +
      Math.floor(
        nextRandom() *
          (relayWorkload.maxChangeBytes - relayWorkload.minChangeBytes),
      ),
  ).fill(index & 0xff),
}));
const readIndexes = Array.from({ length: relayWorkload.readCount }, () =>
  Math.floor(nextRandom() * messageCount),
);

const deps = createRelayDeps();
await using run = createRun(deps);
const sqlite = await run.ok(createSqlite(Name.orThrow("relay")));
createBaseSqliteStorageTables({ sqlite });
createRelayStorageTables({ sqlite });
const storage = createRelaySqliteStorage({ ...deps, sqlite })({
  isOwnerWithinQuota: () => true,
});
const ownerIdBytes = ownerIdToOwnerIdBytes(testAppOwner.id);

const time = async (fn: () => unknown): Promise<number> => {
  const start = performance.now();
  await fn();
  return performance.now() - start;
};

const writeMs = await time(async () => {
  for (let index = 0; index < messageCount; index += batchSize) {
    const batch = messages.slice(index, index + batchSize);
    await run.orThrow(
      storage.writeMessages(
        ownerIdBytes,
        testAppOwner.writeKey,
        batch as unknown as Parameters<typeof storage.writeMessages>[2],
      ),
    );
  }
});

const size = storage.getSize(ownerIdBytes);
const step = Math.floor(size / bucketCount);
const bucket = (index: number) =>
  NonNegativeInt.orThrow(index === bucketCount - 1 ? size : (index + 1) * step);
// Non-empty, which the new code's Storage requires.
const buckets: [
  ReturnType<typeof bucket>,
  ...Array<ReturnType<typeof bucket>>,
] = [
  bucket(0),
  ...Array.from({ length: bucketCount - 1 }, (_, index) => bucket(index + 1)),
];
const fingerprints = createHash("sha256");
const fingerprintMs = await time(() => {
  for (let repeat = 0; repeat < fingerprintRepeats; repeat++) {
    const ranges = storage.fingerprintRanges(ownerIdBytes, buckets);
    if (repeat === 0)
      for (const range of ranges)
        fingerprints.update(
          "fingerprint" in range ? range.fingerprint : new Uint8Array(),
        );
  }
});

const iterated = createHash("sha256");
const counts = { iterated: 0 };
const iterateMs = await time(() => {
  for (let repeat = 0; repeat < relayWorkload.iterateRepeats; repeat++) {
    const isFirst = repeat === 0;
    storage.iterate(
      ownerIdBytes,
      NonNegativeInt.orThrow(0),
      size,
      (timestamp) => {
        if (isFirst) iterated.update(timestamp);
        counts.iterated++;
        return true;
      },
    );
  }
});

const read = createHash("sha256");
const readMs = await time(() => {
  for (const index of readIndexes) {
    const message = messages[index];
    if (message == null) throw new Error(`No message ${index}.`);
    read.update(
      storage.readDbChange(
        ownerIdBytes,
        timestampToTimestampBytes(message.timestamp),
      ),
    );
  }
});

const output: RelayRunOutput = {
  sizeAfterWrites: size,
  databaseBytes: statSync(join(process.cwd(), "relay.db")).size,
  phasesMs: {
    write: writeMs,
    fingerprint: fingerprintMs,
    iterate: iterateMs,
    read: readMs,
  },
  digests: {
    fingerprints: fingerprints.digest("hex"),
    iterated: `${counts.iterated}:${iterated.digest("hex")}`,
    read: read.digest("hex"),
  },
};
await sqlite[Symbol.asyncDispose]();
process.stdout.write(`${JSON.stringify(output)}\n`);
