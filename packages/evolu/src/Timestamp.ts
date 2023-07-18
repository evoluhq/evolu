import * as Schema from "@effect/schema/Schema";
import { Brand } from "effect";
import "effect/Brand";
import { murmurhash } from "./Murmurhash.js";

// https://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html
// https://jaredforsyth.com/posts/hybrid-logical-clocks/
// https://github.com/clintharris/crdt-example-app_annotated/blob/master/shared/timestamp.js
export interface Timestamp {
  readonly node: NodeId;
  readonly millis: Millis;
  readonly counter: Counter;
}

export const NodeId = Schema.string.pipe(
  Schema.pattern(/^[\w-]{16}$/),
  Schema.brand("NodeId")
);
export type NodeId = Schema.To<typeof NodeId>;

export const Millis = Schema.number.pipe(
  Schema.greaterThanOrEqualTo(0),
  Schema.brand("Millis")
);
export type Millis = Schema.To<typeof Millis>;

export const Counter = Schema.number.pipe(
  Schema.between(0, 65535),
  Schema.brand("Counter")
);
export type Counter = Schema.To<typeof Counter>;

export type TimestampHash = number & Brand.Brand<"TimestampHash">;

export type TimestampString = string & Brand.Brand<"TimestampString">;

export const timestampToString = (t: Timestamp): TimestampString =>
  [
    new Date(t.millis).toISOString(),
    t.counter.toString(16).toUpperCase().padStart(4, "0"),
    t.node,
  ].join("-") as TimestampString;

// TODO: Use Schema and Effect
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

const syncNodeId = Schema.parseSync(NodeId)("0000000000000000");

export const createSyncTimestamp = (
  millis: Millis = 0 as Millis
): Timestamp => ({
  millis,
  counter: 0 as Counter,
  node: syncNodeId,
});
