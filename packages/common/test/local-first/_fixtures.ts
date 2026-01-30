/* eslint-disable evolu/require-pure-annotation */
import {
  createAppOwner,
  createOwnerSecret,
  ownerIdToOwnerIdBytes,
} from "../../src/index.js";
import {
  Counter,
  createTimestamp,
  maxCounter,
  maxNodeId,
  NodeId,
  orderTimestampBytes,
  timestampToTimestampBytes,
} from "../../src/local-first/Timestamp.js";
import { createTestDeps } from "../../src/Test.js";
import { maxMillis, Millis } from "../../src/Time.js";

const deps = createTestDeps();

// Random numbers are unique only for a few thousand iterations.
// We leverage this behavior to generate counters.
// See: https://github.com/transitive-bullshit/random/issues/45
const numberOfTimestamps = 7000; // 473 duplicates
const oneYearMillis = 365 * 24 * 60 * 60 * 1000;

const randomMillisMap = new Map<Millis, { counter: Counter; nodeId: NodeId }>();
const timestamps: Array<[Millis, Counter, NodeId]> = [];

for (let i = 0; i < numberOfTimestamps; i++) {
  const millis = deps.randomLib.int(0, oneYearMillis) as Millis;
  const entry = randomMillisMap.get(millis);

  if (entry) {
    entry.counter = (entry.counter + 1) as Counter;
    timestamps.push([millis, entry.counter, entry.nodeId]);
  } else {
    const nodeId = (
      deps.randomLib.next() > 0.8 ? "99c99028d6636a91" : "68a2a7bf3f85a096"
    ) as NodeId;
    randomMillisMap.set(millis, { counter: 0 as Counter, nodeId });
    timestamps.push([millis, 0 as Counter, nodeId]);
  }
}

export const testTimestampsAsc = timestamps
  .map(([millis, counter, nodeId]) =>
    timestampToTimestampBytes(createTimestamp({ millis, counter, nodeId })),
  )
  .toSorted(orderTimestampBytes)
  .slice(0, 5000 - 2); //  for two edges

const minTimestamp = timestampToTimestampBytes(createTimestamp());
export const maxTimestamp = timestampToTimestampBytes(
  createTimestamp({
    millis: maxMillis,
    counter: maxCounter,
    nodeId: maxNodeId,
  }),
);

testTimestampsAsc.unshift(minTimestamp);
testTimestampsAsc.push(maxTimestamp);

export const testTimestampsDesc = testTimestampsAsc.toReversed();
export const testTimestampsRandom = deps.randomLib.shuffle(testTimestampsAsc);

export const testAnotherTimestampsAsc = timestamps
  .map(([millis, counter, nodeId]) =>
    timestampToTimestampBytes(
      createTimestamp({
        millis: (millis + 1) as Millis,
        counter,
        nodeId: nodeId.replaceAll("9", "8") as NodeId,
      }),
    ),
  )
  .toSorted(orderTimestampBytes)
  .slice(0, 1000);

export const testOwnerSecret = createOwnerSecret({
  randomBytes: deps.randomBytes,
});
export const testOwnerSecret2 = createOwnerSecret({
  randomBytes: deps.randomBytes,
});

export const testOwner = createAppOwner(testOwnerSecret);
export const testOwnerIdBytes = ownerIdToOwnerIdBytes(testOwner.id);

export const testOwner2 = createAppOwner(testOwnerSecret2);
export const testOwnerIdBytes2 = ownerIdToOwnerIdBytes(testOwner2.id);
