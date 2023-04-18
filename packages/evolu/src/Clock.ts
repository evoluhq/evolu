import * as Timestamp from "./Timestamp.js";
import * as MerkleTree from "./MerkleTree.js";
import * as Db from "./Db.js";
import * as Effect from "@effect/io/Effect";
import { pipe } from "@effect/data/Function";

export interface Clock {
  readonly timestamp: Timestamp.Timestamp;
  readonly merkleTree: MerkleTree.MerkleTree;
}

export const read: Effect.Effect<Db.Db, never, Clock> = pipe(
  Db.Db,
  Effect.flatMap((db) =>
    db.exec(`select "timestamp", "merkleTree" from "__clock" limit 1`)
  ),
  Effect.map(([{ timestamp, merkleTree }]) => ({
    timestamp: Timestamp.unsafeFromString(
      timestamp as Timestamp.TimestampString
    ),
    merkleTree: MerkleTree.unsafeFromString(
      merkleTree as MerkleTree.MerkleTreeString
    ),
  }))
);

export const update = (clock: Clock): Effect.Effect<Db.Db, never, void> =>
  Effect.flatMap(Db.Db, (db) =>
    db.exec({
      sql: `
        update "__clock"
        set
          "timestamp" = ?,
          "merkleTree" = ?
      `,
      parameters: [
        Timestamp.toString(clock.timestamp),
        MerkleTree.toString(clock.merkleTree),
      ],
    })
  );
