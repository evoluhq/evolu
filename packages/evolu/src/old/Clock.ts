import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import {
  merkleTreeToString,
  unsafeMerkleTreeFromString,
} from "./MerkleTree.js";
import { timestampToString, unsafeTimestampFromString } from "./Timestamp.js";
import { Clock, Db, MerkleTreeString, TimestampString } from "./Types.js";

export const readClock = pipe(
  Db,
  Effect.flatMap((db) =>
    db.exec(`select "timestamp", "merkleTree" from "__clock" limit 1`),
  ),
  Effect.map(([{ timestamp, merkleTree }]) => ({
    timestamp: unsafeTimestampFromString(timestamp as TimestampString),
    merkleTree: unsafeMerkleTreeFromString(merkleTree as MerkleTreeString),
  })),
);

export const writeClock = (clock: Clock): Effect.Effect<Db, never, void> =>
  Effect.flatMap(Db, (db) =>
    db.exec({
      sql: `
        update "__clock"
        set
          "timestamp" = ?,
          "merkleTree" = ?
      `,
      parameters: [
        timestampToString(clock.timestamp),
        merkleTreeToString(clock.merkleTree),
      ],
    }),
  );
