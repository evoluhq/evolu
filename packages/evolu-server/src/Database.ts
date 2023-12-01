import { OwnerId, TimestampString } from "@evolu/common";

export interface Database {
  readonly message: MessageTable;
  readonly merkleTree: MerkleTreeTable;
}

interface MessageTable {
  readonly timestamp: TimestampString;
  readonly userId: OwnerId;
  readonly content: Uint8Array;
}

interface MerkleTreeTable {
  readonly timestamp: TimestampString;
  readonly userId: OwnerId;
  readonly content: Uint8Array;
}
