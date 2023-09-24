import { Timestamp } from "../src/Timestamp.js";

export const makeNode1Timestamp = (millis = 0, counter = 0): Timestamp =>
  ({
    millis,
    counter,
    node: "0000000000000001",
  }) as Timestamp;

export const makeNode2Timestamp = (millis = 0, counter = 0): Timestamp =>
  ({
    millis,
    counter,
    node: "0000000000000002",
  }) as Timestamp;
