import sqlite3, { Statement } from "better-sqlite3";
import bodyParser from "body-parser";
import cors from "cors";
import {
  createInitialMerkleTree,
  createSyncTimestamp,
  diffMerkleTrees,
  EncryptedCrdtMessage,
  insertIntoMerkleTree,
  MerkleTree,
  merkleTreeFromString,
  MerkleTreeString,
  merkleTreeToString,
  Millis,
  SyncRequest,
  SyncResponse,
  timestampFromString,
  TimestampString,
  timestampToString,
} from "evolu";
import express from "express";
import * as fpts from "fp-ts";
import { either, option, readerEither, readonlyArray } from "fp-ts";
import { ReaderEither } from "fp-ts/lib/ReaderEither.js";
import path from "path";

// A workaround until fp-ts 3 release.
const { flow, pipe } = fpts.function;

interface Db {
  readonly begin: Statement;
  readonly rollback: Statement;
  readonly commit: Statement;
  readonly selectMerkleTree: Statement;
  readonly insertOrIgnoreIntoMessage: Statement;
  readonly insertOrReplaceIntoMerkleTree: Statement;
  readonly selectMessages: Statement;
}

interface DbEnv {
  readonly db: Db;
}

interface ReqEnv {
  readonly req: SyncRequest;
}

type DbAndReqEnvs = DbEnv & ReqEnv;

interface ParseBodyError {
  readonly type: "ParseBodyError";
  readonly error: unknown;
}

interface SqliteError {
  readonly type: "SqliteError";
  readonly error: unknown;
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

const sqliteErrorFromError = (error: unknown): SqliteError => ({
  type: "SqliteError",
  error,
});

const parseBody: ReaderEither<Uint8Array, ParseBodyError, ReqEnv> = (body) =>
  pipe(
    either.tryCatch(
      () => SyncRequest.fromBinary(body),
      (error): ParseBodyError => ({ type: "ParseBodyError", error })
    ),
    either.map((req) => ({ req }))
  );

const getMerkleTree: ReaderEither<DbAndReqEnvs, SqliteError, MerkleTree> = ({
  db,
  req,
}) =>
  pipe(
    either.tryCatch(
      () =>
        db.selectMerkleTree.get(req.userId) as
          | { readonly merkleTree: MerkleTreeString }
          | undefined,
      sqliteErrorFromError
    ),
    either.map((row) =>
      row ? merkleTreeFromString(row.merkleTree) : createInitialMerkleTree()
    )
  );

const addMessages =
  (
    merkleTree: MerkleTree
  ): ReaderEither<DbAndReqEnvs, SqliteError, MerkleTree> =>
  ({ db, req }) =>
    either.tryCatch(
      () => {
        if (req.messages.length === 0) return merkleTree;

        db.begin.run();
        req.messages.forEach((message) => {
          const result = db.insertOrIgnoreIntoMessage.run(
            message.timestamp,
            req.userId,
            message.content
          );
          if (result.changes === 1)
            // eslint-disable-next-line no-param-reassign
            merkleTree = insertIntoMerkleTree(
              timestampFromString(message.timestamp as TimestampString)
            )(merkleTree);
        });
        db.insertOrReplaceIntoMerkleTree.run(
          req.userId,
          merkleTreeToString(merkleTree)
        );
        db.commit.run();
        return merkleTree;
      },
      (error): SqliteError => {
        db.rollback.run();
        return sqliteErrorFromError(error);
      }
    );

const getMessages =
  ({
    merkleTree,
  }: {
    readonly merkleTree: MerkleTree;
  }): ReaderEither<
    DbAndReqEnvs,
    SqliteError,
    readonly EncryptedCrdtMessage[]
  > =>
  ({ db, req }) =>
    pipe(
      diffMerkleTrees(
        merkleTree,
        merkleTreeFromString(req.merkleTree as MerkleTreeString)
      ),
      // TODO: Remove `:Millis` with fp-ts 3
      option.map((millis: Millis) =>
        either.tryCatch(
          () =>
            db.selectMessages.all(
              req.userId,
              pipe(millis, createSyncTimestamp, timestampToString),
              req.nodeId
            ) as readonly EncryptedCrdtMessage[],
          sqliteErrorFromError
        )
      ),
      option.getOrElseW(() => either.right(readonlyArray.empty))
    );

const sync: ReaderEither<
  DbAndReqEnvs,
  SqliteError,
  {
    readonly merkleTree: MerkleTree;
    readonly messages: readonly EncryptedCrdtMessage[];
  }
> = pipe(
  getMerkleTree,
  readerEither.chain(addMessages),
  readerEither.bindTo("merkleTree"),
  readerEither.bind("messages", getMessages)
);

const dbEnv: DbEnv = { db: createDb("db.sqlite") };

const app = express();
app.use(cors());
app.use(bodyParser.raw({ limit: "20mb" }));

app.post("/", (req, res) => {
  pipe(
    parseBody(req.body),
    either.map((reqEnv): DbAndReqEnvs => ({ ...dbEnv, ...reqEnv })),
    either.chainW(sync),
    either.match(
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
              messages: [...messages], // to mutable array
            })
          )
        );
      }
    )
  );
});

app.get("/ping", (_req, res) => {
  res.send("ok");
});

const port = 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server is listening at http://localhost:${port}`);
});
