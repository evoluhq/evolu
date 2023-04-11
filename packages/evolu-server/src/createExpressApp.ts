import * as Context from "@effect/data/Context";
import { flow, pipe } from "@effect/data/Function";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import * as Exit from "@effect/io/Exit";
import sqlite3, { Statement } from "better-sqlite3";
import bodyParser from "body-parser";
import cors from "cors";
import * as MerkleTree from "evolu/MerkleTree";
import * as Timestamp from "evolu/Timestamp";
import express, { Request } from "express";
import path from "path";
import * as Protobuf from "evolu/Protobuf";

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
): Effect.Effect<Db, SqliteError, MerkleTree.MerkleTree> =>
  pipe(
    DbTag,
    Effect.flatMap(({ selectMerkleTree }) =>
      Effect.tryCatch(
        () =>
          selectMerkleTree.get(userId) as
            | { readonly merkleTree: MerkleTree.MerkleTreeString }
            | undefined,
        (error) => new SqliteError(error)
      )
    ),
    Effect.map((row) =>
      row
        ? MerkleTree.merkleTreeFromString(row.merkleTree)
        : MerkleTree.createInitialMerkleTree()
    )
  );

const addMessages = ({
  merkleTree,
  messages,
  userId,
}: {
  merkleTree: MerkleTree.MerkleTree;
  messages: ReadonlyArray.NonEmptyArray<Protobuf.EncryptedCrdtMessage>;
  userId: string;
}): Effect.Effect<Db, SqliteError, MerkleTree.MerkleTree> =>
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
              merkleTree = MerkleTree.insertInto(
                Timestamp.unsafeTimestampFromString(
                  message.timestamp as Timestamp.TimestampString
                )
              )(merkleTree);
          });

          db.insertOrReplaceIntoMerkleTree.run(
            userId,
            MerkleTree.merkleTreeToString(merkleTree)
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
  millis: Timestamp.Millis;
  userId: string;
  nodeId: string;
}): Effect.Effect<
  Db,
  SqliteError,
  ReadonlyArray<Protobuf.EncryptedCrdtMessage>
> =>
  pipe(
    DbTag,
    Effect.flatMap((db) =>
      Effect.tryCatch(
        () =>
          db.selectMessages.all(
            userId,
            pipe(
              millis,
              Timestamp.createSyncTimestamp,
              Timestamp.timestampToString
            ),
            nodeId
          ) as ReadonlyArray<Protobuf.EncryptedCrdtMessage>,
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
    merkleTree: MerkleTree.MerkleTree;
    messages: ReadonlyArray<Protobuf.EncryptedCrdtMessage>;
  }
> =>
  pipe(
    Effect.tryCatch(
      () => Protobuf.SyncRequest.fromBinary(req.body),
      (error) => new BadRequestError(error)
    ),
    Effect.flatMap((syncRequest) =>
      Effect.gen(function* ($) {
        let merkleTree = yield* $(getMerkleTree(syncRequest.userId));

        if (ReadonlyArray.isNonEmptyArray(syncRequest.messages))
          merkleTree = yield* $(
            addMessages({
              merkleTree,
              messages: syncRequest.messages,
              userId: syncRequest.userId,
            })
          );

        const diff = MerkleTree.diff(
          merkleTree,
          MerkleTree.merkleTreeFromString(
            syncRequest.merkleTree as MerkleTree.MerkleTreeString
          )
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
              Protobuf.SyncResponse.toBinary({
                merkleTree: MerkleTree.merkleTreeToString(merkleTree),
                messages: messages as Array<Protobuf.EncryptedCrdtMessage>,
              })
            )
          );
        }
      )
    );
  });

  return app;
};
