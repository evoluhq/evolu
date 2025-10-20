import {
  Counter,
  createTimestamp,
  maxCounter,
  maxMillis,
  maxNodeId,
  Millis,
  NodeId,
  orderTimestampBytes,
  timestampToTimestampBytes,
} from "../../src/Evolu/Timestamp.js";
import { testRandomLib } from "../_deps.js";

// Random numbers are unique only for a few thousand iterations.
// We leverage this behavior to generate counters.
// See: https://github.com/transitive-bullshit/random/issues/45
const numberOfTimestamps = 7000; // 473 duplicates
const oneYearMillis = 365 * 24 * 60 * 60 * 1000;

const randomMillisMap = new Map<Millis, { counter: Counter; nodeId: NodeId }>();
const timestamps: Array<[Millis, Counter, NodeId]> = [];

for (let i = 0; i < numberOfTimestamps; i++) {
  const millis = testRandomLib.int(0, oneYearMillis) as Millis;
  const entry = randomMillisMap.get(millis);

  if (entry) {
    entry.counter = (entry.counter + 1) as Counter;
    timestamps.push([millis, entry.counter, entry.nodeId]);
  } else {
    const nodeId = (
      testRandomLib.next() > 0.8 ? "99c99028d6636a91" : "68a2a7bf3f85a096"
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
export const testTimestampsRandom = testRandomLib.shuffle(testTimestampsAsc);

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
