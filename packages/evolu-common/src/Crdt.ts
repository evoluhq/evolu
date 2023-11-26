import * as S from "@effect/schema/Schema";
import {
  Brand,
  Context,
  Effect,
  Either,
  Layer,
  Number,
  Option,
  ReadonlyArray,
  String,
  pipe,
} from "effect";
import { Config } from "./Config.js";
import { NanoId, NodeId } from "./Crypto.js";
import { murmurhash } from "./Murmurhash.js";

// https://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html
// https://jaredforsyth.com/posts/hybrid-logical-clocks/
// https://github.com/clintharris/crdt-example-app_annotated/blob/master/shared/timestamp.js
// https://github.com/actualbudget/actual/tree/master/packages/crdt

export interface Timestamp {
  readonly node: NodeId;
  readonly millis: Millis;
  readonly counter: Counter;
}

export const AllowedTimeRange = {
  greaterThan: 860934419999,
  lessThan: 2582803260000,
};

/**
 * Millis represents a time that is valid for usage with the Merkle tree. It
 * must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length
 * equals 16. We can find diff for two Merkle trees only within this range. If
 * the device clock is out of range, Evolu will not store data until it's
 * fixed.
 */
export const Millis = S.number.pipe(
  S.greaterThan(AllowedTimeRange.greaterThan),
  S.lessThan(AllowedTimeRange.lessThan),
  S.brand("Millis"),
);

export type Millis = S.Schema.To<typeof Millis>;

export const initialMillis = S.parseSync(Millis)(
  AllowedTimeRange.greaterThan + 1,
);

export const Counter = S.number.pipe(S.between(0, 65535), S.brand("Counter"));
export type Counter = S.Schema.To<typeof Counter>;

const initialCounter = S.parseSync(Counter)(0);

export type TimestampHash = number & Brand.Brand<"TimestampHash">;

export type TimestampString = string & Brand.Brand<"TimestampString">;

export const timestampToString = (t: Timestamp): TimestampString =>
  [
    new Date(t.millis).toISOString(),
    t.counter.toString(16).toUpperCase().padStart(4, "0"),
    t.node,
  ].join("-") as TimestampString;

export const unsafeTimestampFromString = (s: TimestampString): Timestamp => {
  const a = s.split("-");
  return {
    millis: Date.parse(a.slice(0, 3).join("-")).valueOf() as Millis,
    counter: parseInt(a[3], 16) as Counter,
    node: a[4] as NodeId,
  };
};

export const timestampToHash = (t: Timestamp): TimestampHash =>
  murmurhash(timestampToString(t)) as TimestampHash;

const syncNodeId = S.parseSync(NodeId)("0000000000000000");

export const makeSyncTimestamp = (
  millis: Millis = initialMillis,
): Timestamp => ({
  millis,
  counter: initialCounter,
  node: syncNodeId,
});

export const makeInitialTimestamp = NanoId.pipe(
  Effect.flatMap(({ nanoidAsNodeId }) => nanoidAsNodeId),
  Effect.map(
    (node): Timestamp => ({
      millis: initialMillis,
      counter: initialCounter,
      node,
    }),
  ),
);

export interface Time {
  readonly now: Effect.Effect<never, TimestampTimeOutOfRangeError, Millis>;
}

export const Time = Context.Tag<Time>();

export const TimeLive = Layer.succeed(
  Time,
  Time.of({
    now: Effect.suspend(() => S.parse(Millis)(Date.now())).pipe(
      Effect.catchTag("ParseError", () =>
        Effect.fail<TimestampTimeOutOfRangeError>({
          _tag: "TimestampTimeOutOfRangeError",
        }),
      ),
    ),
  }),
);

/**
 * The TimestampError type represents all Timestamp-related errors. If such an
 * error happens, the device clock is skewed and should be set to the current
 * time.
 */
export type TimestampError =
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampDuplicateNodeError
  | TimestampTimeOutOfRangeError;

export interface TimestampDriftError {
  readonly _tag: "TimestampDriftError";
  readonly next: Millis;
  readonly now: Millis;
}

export interface TimestampCounterOverflowError {
  readonly _tag: "TimestampCounterOverflowError";
}

export interface TimestampDuplicateNodeError {
  readonly _tag: "TimestampDuplicateNodeError";
  readonly node: NodeId;
}

export interface TimestampTimeOutOfRangeError {
  readonly _tag: "TimestampTimeOutOfRangeError";
}

const getNextMillis = (
  millis: ReadonlyArray<Millis>,
): Effect.Effect<
  Time | Config,
  TimestampDriftError | TimestampTimeOutOfRangeError,
  Millis
> =>
  Effect.gen(function* (_) {
    const time = yield* _(Time);
    const config = yield* _(Config);

    const now = yield* _(time.now);
    const next = Math.max(now, ...millis) as Millis;

    if (next - now > config.maxDrift)
      yield* _(
        Effect.fail<TimestampDriftError>({
          _tag: "TimestampDriftError",
          now,
          next,
        }),
      );

    return next;
  });

const incrementCounter = (
  counter: Counter,
): Either.Either<TimestampCounterOverflowError, Counter> =>
  pipe(
    Number.increment(counter),
    S.parseEither(Counter),
    Either.mapLeft(() => ({ _tag: "TimestampCounterOverflowError" })),
  );

const counterMin = S.parseSync(Counter)(0);

export const sendTimestamp = (
  timestamp: Timestamp,
): Effect.Effect<
  Time | Config,
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampTimeOutOfRangeError,
  Timestamp
> =>
  Effect.gen(function* (_) {
    const millis = yield* _(getNextMillis([timestamp.millis]));
    const counter =
      millis === timestamp.millis
        ? yield* _(incrementCounter(timestamp.counter))
        : counterMin;
    return { ...timestamp, millis, counter };
  });

export const receiveTimestamp = ({
  local,
  remote,
}: {
  readonly local: Timestamp;
  readonly remote: Timestamp;
}): Effect.Effect<
  Time | Config,
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampDuplicateNodeError
  | TimestampTimeOutOfRangeError,
  Timestamp
> =>
  Effect.gen(function* (_) {
    if (local.node === remote.node)
      yield* _(
        Effect.fail<TimestampDuplicateNodeError>({
          _tag: "TimestampDuplicateNodeError",
          node: local.node,
        }),
      );

    const millis = yield* _(getNextMillis([local.millis, remote.millis]));
    const counter = yield* _(
      millis === local.millis && millis === remote.millis
        ? incrementCounter(Math.max(local.counter, remote.counter) as Counter)
        : millis === local.millis
          ? incrementCounter(local.counter)
          : millis === remote.millis
            ? incrementCounter(remote.counter)
            : Either.right(counterMin),
    );

    return { ...local, millis, counter };
  });

/**
 * It's actually not Merkle Tree but a Merkleized prefix tree, aka Merkle Trie.
 * https://decomposition.al/blog/2019/05/31/how-i-learned-about-merklix-trees-without-having-to-become-a-cryptocurrency-enthusiast
 */
export interface MerkleTree {
  readonly hash?: TimestampHash;
  readonly "0"?: MerkleTree;
  readonly "1"?: MerkleTree;
  readonly "2"?: MerkleTree;
}

export type MerkleTreeString = string & Brand.Brand<"MerkleTreeString">;

export const initialMerkleTree = Object.create(null) as MerkleTree;

type MerkleTreeKey = keyof Omit<MerkleTree, "hash">;

type MerkleTreePath = ReadonlyArray<MerkleTreeKey>;

export const millisToMerkleTreePath = (millis: Millis): MerkleTreePath =>
  Math.floor(millis / 1000 / 60)
    .toString(3)
    .split("") as MerkleTreePath;

const merkleTreePathToMillis = (path: MerkleTreePath): Millis =>
  path.length === 0
    ? initialMillis
    : // 16 is the length of the base 3 value of the current time in minutes.
      // Ensure it's padded to create the full value.
      ((parseInt(path.join("").padEnd(16, "0"), 3) * 1000 * 60) as Millis);

const xorTimestampHashes = (
  a: TimestampHash | undefined,
  b: TimestampHash,
): TimestampHash => ((a || 0) ^ b) as TimestampHash;

const insertKey = (
  tree: MerkleTree,
  path: MerkleTreePath,
  hash: TimestampHash,
): MerkleTree => {
  if (path.length === 0) return tree;
  const key = path[0];
  const child = tree[key] || {};
  return {
    ...tree,
    [key]: {
      ...child,
      ...insertKey(child, path.slice(1), hash),
      hash: xorTimestampHashes(child.hash, hash),
    },
  };
};

export const insertIntoMerkleTree =
  (timestamp: Timestamp) =>
  (tree: MerkleTree): MerkleTree => {
    const path = millisToMerkleTreePath(timestamp.millis);
    const hash = timestampToHash(timestamp);
    return insertKey(
      { ...tree, hash: xorTimestampHashes(tree.hash, hash) },
      path,
      hash,
    );
  };

const sortedMerkleTreeKeys: ReadonlyArray<MerkleTreeKey> = ["0", "1", "2"];

const getSortedMerkleTreeKeys = (
  tree: MerkleTree,
): ReadonlyArray<MerkleTreeKey> =>
  sortedMerkleTreeKeys.filter((key) => key in tree);

export const diffMerkleTrees = (
  tree1: MerkleTree,
  tree2: MerkleTree,
): Option.Option<Millis> => {
  if (tree1.hash === tree2.hash) return Option.none();
  let node1 = tree1;
  let node2 = tree2;
  let diffPath: MerkleTreePath = [];

  // This loop will eventually stop when it traverses down to find
  // where the hashes differ, or otherwise when there are no leaves
  // left (this shouldn't happen, if that's the case the hash check at
  // the top of this function should pass)
  // eslint-disable-next-line no-constant-condition
  while (1) {
    const keys = ReadonlyArray.dedupeWith(
      getSortedMerkleTreeKeys(node1).concat(getSortedMerkleTreeKeys(node2)),
      String.Equivalence,
    );
    let diffKey: MerkleTreeKey | null = null;

    // Traverse down the trie through keys that are different. We
    // traverse down the keys in order. Stop in two cases: either one
    // of the nodes doesn't have the key or a different key isn't
    // found. For the former case, we have to do that because pruning is
    // lossy. We don't know if we've pruned off a changed key, so we
    // can't traverse down anymore. For the latter case, it means two
    // things: either we've hit the bottom of the tree, or the changed
    // key has been pruned off. In the latter case, we have a "partial"
    // key and will fill the rest with 0s. If multiple older
    // messages were added into one trie, we might likely
    // generate a time that only encompasses *some* of those
    // messages. Pruning is lossy, and we traverse down the left-most
    // changed time that we know of, because of pruning, it might take
    // multiple passes to sync up a trie.
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const next1 = node1[key];
      const next2 = node2[key];
      if (!next1 || !next2) break;
      if (next1.hash !== next2.hash) {
        diffKey = key;
        break;
      }
    }

    if (!diffKey) {
      return Option.some(merkleTreePathToMillis(diffPath));
    }

    diffPath = [...diffPath, diffKey];
    node1 = node1[diffKey] || initialMerkleTree;
    node2 = node2[diffKey] || initialMerkleTree;
  }

  return Option.none();
};

export const merkleTreeToString = (m: MerkleTree): MerkleTreeString =>
  JSON.stringify(m) as MerkleTreeString;

export const unsafeMerkleTreeFromString = (m: MerkleTreeString): MerkleTree =>
  JSON.parse(m) as MerkleTree;
