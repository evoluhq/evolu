import * as Schema from "@effect/schema/Schema";
import { Millis, Timestamp, initialMillis } from "../src/Crdt.js";

export const makeNode1Timestamp = (
  millis = 0,
  counter = 0,
  node = "0000000000000001",
): Timestamp =>
  ({
    millis: Schema.parseSync(Millis)(initialMillis + millis),
    counter,
    node,
  }) as Timestamp;

export const makeNode2Timestamp = (millis = 0, counter = 0): Timestamp =>
  makeNode1Timestamp(millis, counter, "0000000000000002");
