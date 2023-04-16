import * as Timestamp from "./Timestamp.js";
import * as MerkleTree from "./MerkleTree.js";

export interface Clock {
  readonly timestamp: Timestamp.Timestamp;
  readonly merkleTree: MerkleTree.MerkleTree;
}
