import { Timestamp } from "../src/types.js";

export const createNode1Timestamp = (millis = 0, counter = 0): Timestamp =>
  ({
    millis,
    counter,
    node: "0000000000000001",
  } as Timestamp);

export const createNode2Timestamp = (millis = 0, counter = 0): Timestamp =>
  ({
    millis,
    counter,
    node: "0000000000000002",
  } as Timestamp);
