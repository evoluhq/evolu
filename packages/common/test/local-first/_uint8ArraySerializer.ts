import { SnapshotSerializer } from "vitest";

export default {
  serialize(val: Uint8Array, _config, _indentation, _depth, _refs, _printer) {
    return `uint8:[${Array.from(val).join(",")}]`;
  },
  test(val) {
    return val instanceof Uint8Array;
  },
} as SnapshotSerializer;
