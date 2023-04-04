import * as Context from "@effect/data/Context";
import { flow, pipe } from "@effect/data/Function";
import * as RA from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import * as Exit from "@effect/io/Exit";
import sqlite3, { Statement } from "better-sqlite3";
import bodyParser from "body-parser";
import cors from "cors";
import {
  MerkleTree,
  MerkleTreeString,
  createInitialMerkleTree,
  diffMerkleTrees,
  insertIntoMerkleTree,
  merkleTreeFromString,
  merkleTreeToString,
} from "evolu/merkleTree";
import {
  EncryptedCrdtMessage,
  SyncRequest,
  SyncResponse,
} from "evolu/protobuf";
import {
  Millis,
  TimestampString,
  createSyncTimestamp,
  timestampFromString,
  timestampToString,
} from "evolu/timestamp";
import express, { Request } from "express";
import path from "path";

class BadRequestError {
  readonly _tag = "BadRequestError";
  constructor(readonly error: unknown) {}
}

class SqliteError {
  readonly _tag = "SqliteError";
  constructor(readonly error: unknown) {}
}

interface Db {
  readonly begin: Statement;
  readonly rollback: Statement;
  readonly commit: Statement;
  readonly selectMerkleTree: Statement;
  readonly insertOrIgnoreIntoMessage: Statement;
  readonly insertOrReplaceIntoMerkleTree: Statement;
  readonly selectMessages: Statement;
}

const createDb: (fileName: string) => Db = flow(
  (fileName) => path.join(process.cwd(), "/", fileName),
  sqlite3,
  (sqlite) => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS "message" (
        "timestamp" TEXT,
        "userId" TEXT,
        "content" BLOB,
        PRIMARY KEY(timestamp, userId)
      );
      CREATE TABLE IF NOT EXISTS "merkleTree" (
        "userId" TEXT PRIMARY KEY,
        "merkleTree" TEXT
      );
    `);

    return {
      begin: sqlite.prepare(`BEGIN`),
      rollback: sqlite.prepare(`ROLLBACK`),
      commit: sqlite.prepare(`COMMIT`),

      selectMerkleTree: sqlite.prepare(
        `SELECT "merkleTree" FROM "merkleTree" WHERE "userId" = ?`
      ),

      insertOrIgnoreIntoMessage: sqlite.prepare(`
        INSERT OR IGNORE INTO "message" (
          "timestamp", "userId", "content"
        ) VALUES (?, ?, ?) ON CONFLICT DO NOTHING
      `),

      insertOrReplaceIntoMerkleTree: sqlite.prepare(`
        INSERT OR REPLACE INTO "merkleTree" (
          "userId", "merkleTree"
        ) VALUES (?, ?)
      `),

      selectMessages: sqlite.prepare(`
        SELECT "timestamp", "content" FROM "message"
        WHERE "userId" = ? AND "timestamp" > ? AND "timestamp" NOT LIKE '%' || ?
        ORDER BY "timestamp"
      `),
    };
  }
);

const DbTag = Context.Tag<Db>();

const getMerkleTree = (
  userId: string
): Effect.Effect<Db, SqliteError, MerkleTree> =>
  pipe(
    DbTag,
    Effect.flatMap(({ selectMerkleTree }) =>
      Effect.tryCatch(
        () =>
          selectMerkleTree.get(userId) as
            | { readonly merkleTree: MerkleTreeString }
            | undefined,
        (error) => new SqliteError(error)
      )
    ),
    Effect.map((row) =>
      row ? merkleTreeFromString(row.merkleTree) : createInitialMerkleTree()
    )
  );

const addMessages = ({
  merkleTree,
  messages,
  userId,
}: {
  merkleTree: MerkleTree;
  messages: RA.NonEmptyArray<EncryptedCrdtMessage>;
  userId: string;
}): Effect.Effect<Db, SqliteError, MerkleTree> =>
  pipe(
    DbTag,
    Effect.flatMap((db) =>
      Effect.tryCatch(
        () => {
          db.begin.run();

          messages.forEach((message) => {
            const result = db.insertOrIgnoreIntoMessage.run(
              message.timestamp,
              userId,
              message.content
            );

            if (result.changes === 1)
              merkleTree = insertIntoMerkleTree(
                timestampFromString(message.timestamp as TimestampString)
              )(merkleTree);
          });

          db.insertOrReplaceIntoMerkleTree.run(
            userId,
            merkleTreeToString(merkleTree)
          );

          db.commit.run();

          return merkleTree;
        },
        (error) => {
          db.rollback.run();
          return new SqliteError(error);
        }
      )
    )
  );

const getMessages = ({
  millis,
  userId,
  nodeId,
}: {
  millis: Millis;
  userId: string;
  nodeId: string;
}): Effect.Effect<Db, SqliteError, readonly EncryptedCrdtMessage[]> =>
  pipe(
    DbTag,
    Effect.flatMap((db) =>
      Effect.tryCatch(
        () =>
          db.selectMessages.all(
            userId,
            pipe(millis, createSyncTimestamp, timestampToString),
            nodeId
          ) as readonly EncryptedCrdtMessage[],
        (error) => new SqliteError(error)
      )
    )
  );

const sync = (
  req: Request
): Effect.Effect<
  Db,
  BadRequestError | SqliteError,
  {
    merkleTree: MerkleTree;
    messages: readonly EncryptedCrdtMessage[];
  }
> =>
  pipe(
    Effect.tryCatch(
      () => SyncRequest.fromBinary(req.body),
      (error) => new BadRequestError(error)
    ),
    Effect.flatMap((syncRequest) =>
      Effect.gen(function* ($) {
        let merkleTree = yield* $(getMerkleTree(syncRequest.userId));

        if (RA.isNonEmptyArray(syncRequest.messages))
          merkleTree = yield* $(
            addMessages({
              merkleTree,
              messages: syncRequest.messages,
              userId: syncRequest.userId,
            })
          );

        const diff = diffMerkleTrees(
          merkleTree,
          merkleTreeFromString(syncRequest.merkleTree as MerkleTreeString)
        );

        const messages =
          diff._tag === "None"
            ? []
            : yield* $(
                getMessages({
                  millis: diff.value,
                  userId: syncRequest.userId,
                  nodeId: syncRequest.nodeId,
                })
              );

        return { merkleTree, messages };
      })
    )
  );

export const createExpressApp = (): express.Express => {
  const db = createDb("db.sqlite");

  const app = express();
  app.use(cors());
  app.use(bodyParser.raw({ limit: "20mb" }));

  app.post("/", (req, res) => {
    Effect.runCallback(
      pipe(sync(req), Effect.provideService(DbTag, db)),
      Exit.match(
        (error) => {
          // eslint-disable-next-line no-console
          console.log(error);
          res.status(500).json("oh noes!");
        },
        ({ merkleTree, messages }) => {
          res.setHeader("Content-Type", "application/octet-stream");
          res.send(
            Buffer.from(
              SyncResponse.toBinary({
                merkleTree: merkleTreeToString(merkleTree),
                messages: messages as EncryptedCrdtMessage[],
              })
            )
          );
        }
      )
    );
  });

  return app;
};
