import {
  EncryptedMessage,
  MerkleTree,
  MerkleTreeString,
  Millis,
  SyncRequest,
  SyncResponse,
  TimestampString,
  diffMerkleTrees,
  initialMerkleTree,
  insertIntoMerkleTree,
  makeSyncTimestamp,
  merkleTreeToString,
  timestampToString,
  unsafeMerkleTreeFromString,
  unsafeTimestampFromString,
} from "@evolu/common";
import sqlite3, { Statement } from "better-sqlite3";
import bodyParser from "body-parser";
import cors from "cors";
import { Context, Effect, Exit, ReadonlyArray, pipe } from "effect";
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

const createDb = (fileName: string): Db =>
  pipe(path.join(process.cwd(), "/", fileName), sqlite3, (sqlite) => {
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
        `SELECT "merkleTree" FROM "merkleTree" WHERE "userId" = ?`,
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
        WHERE "userId" = ? AND "timestamp" >= ? AND "timestamp" NOT LIKE '%' || ?
        ORDER BY "timestamp"
      `),
    };
  });

const DbTag = Context.Tag<Db>();

const getMerkleTree = (
  userId: string,
): Effect.Effect<Db, SqliteError, MerkleTree> =>
  pipe(
    Effect.flatMap(DbTag, ({ selectMerkleTree }) =>
      Effect.try({
        try: () =>
          selectMerkleTree.get(userId) as
            | { readonly merkleTree: MerkleTreeString }
            | undefined,
        catch: (error) => new SqliteError(error),
      }),
    ),
    Effect.map((row) =>
      row ? unsafeMerkleTreeFromString(row.merkleTree) : initialMerkleTree,
    ),
  );

const addMessages = ({
  merkleTree,
  messages,
  userId,
}: {
  merkleTree: MerkleTree;
  messages: ReadonlyArray.NonEmptyReadonlyArray<EncryptedMessage>;
  userId: string;
}): Effect.Effect<Db, SqliteError, MerkleTree> =>
  Effect.flatMap(DbTag, (db) =>
    Effect.try({
      try: () => {
        db.begin.run();

        messages.forEach((message) => {
          const result = db.insertOrIgnoreIntoMessage.run(
            message.timestamp,
            userId,
            message.content,
          );

          if (result.changes === 1)
            merkleTree = insertIntoMerkleTree(
              unsafeTimestampFromString(message.timestamp as TimestampString),
            )(merkleTree);
        });

        db.insertOrReplaceIntoMerkleTree.run(
          userId,
          merkleTreeToString(merkleTree),
        );

        db.commit.run();

        return merkleTree;
      },
      catch: (error) => {
        db.rollback.run();
        return new SqliteError(error);
      },
    }),
  );

const getMessages = ({
  millis,
  userId,
  nodeId,
}: {
  millis: Millis;
  userId: string;
  nodeId: string;
}): Effect.Effect<Db, SqliteError, ReadonlyArray<EncryptedMessage>> =>
  Effect.flatMap(DbTag, (db) =>
    Effect.try({
      try: () =>
        db.selectMessages.all(
          userId,
          pipe(millis, makeSyncTimestamp, timestampToString),
          nodeId,
        ) as ReadonlyArray<EncryptedMessage>,
      catch: (error) => new SqliteError(error),
    }),
  );

const sync = (
  req: Request,
): Effect.Effect<
  Db,
  BadRequestError | SqliteError,
  {
    merkleTree: MerkleTree;
    messages: ReadonlyArray<EncryptedMessage>;
  }
> =>
  Effect.flatMap(
    Effect.try({
      try: () => SyncRequest.fromBinary(req.body as Uint8Array),
      catch: (error) => new BadRequestError(error),
    }),
    (syncRequest) =>
      Effect.gen(function* (_) {
        let merkleTree = yield* _(getMerkleTree(syncRequest.userId));

        if (ReadonlyArray.isNonEmptyReadonlyArray(syncRequest.messages))
          merkleTree = yield* _(
            addMessages({
              merkleTree,
              messages: syncRequest.messages,
              userId: syncRequest.userId,
            }),
          );

        const diff = diffMerkleTrees(
          merkleTree,
          unsafeMerkleTreeFromString(syncRequest.merkleTree),
        );

        const messages =
          diff._tag === "None"
            ? []
            : yield* _(
                getMessages({
                  millis: diff.value,
                  userId: syncRequest.userId,
                  nodeId: syncRequest.nodeId,
                }),
              );

        return { merkleTree, messages };
      }),
  );

export const createExpressApp = (): express.Express => {
  const db = createDb("db.sqlite");

  const app = express();
  app.use(cors());
  app.use(bodyParser.raw({ limit: "20mb" }));

  app.post("/", (req, res) => {
    Effect.runCallback(
      Effect.provideService(sync(req), DbTag, db),
      Exit.match({
        onFailure: (error) => {
          // eslint-disable-next-line no-console
          console.log(error);
          res.status(500).json("oh noes!");
        },
        onSuccess: ({ merkleTree, messages }) => {
          res.setHeader("Content-Type", "application/octet-stream");
          res.send(
            Buffer.from(
              SyncResponse.toBinary({
                merkleTree: merkleTreeToString(merkleTree),
                messages,
              }),
            ),
          );
        },
      }),
    );
  });

  return app;
};
