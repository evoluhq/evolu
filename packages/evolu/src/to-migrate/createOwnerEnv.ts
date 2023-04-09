import { apply, readerTaskEither, taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/lib/ReaderTaskEither.js";
import { createInitialMerkleTree, merkleTreeToString } from "./merkleTree.js";
import { Mnemonic, Owner } from "../Model.js";
import { createInitialTimestamp, timestampToString } from "./timestamp.js";
import { DbEnv, OwnerEnv, UnknownError } from "./types.js";

const getOwnerEnv: ReaderTaskEither<DbEnv, UnknownError, OwnerEnv> = ({ db }) =>
  pipe(
    db.exec(`select "mnemonic", "id", "encryptionKey" from __owner limit 1`),
    taskEither.map(([owner]) => owner as unknown as Owner),
    taskEither.map((owner) => ({ owner }))
  );

const lazyInit =
  (mnemonic?: Mnemonic): ReaderTaskEither<DbEnv, UnknownError, OwnerEnv> =>
  ({ db }) =>
    pipe(
      taskEither.fromTask(() => import("./mnemonic.js")),
      taskEither.map(({ createOwner }) => ({
        timestamp: pipe(createInitialTimestamp(), timestampToString),
        merkleTree: pipe(createInitialMerkleTree(), merkleTreeToString),
        owner: createOwner(mnemonic),
      })),
      taskEither.chainFirst(({ timestamp, merkleTree, owner }) =>
        db.execQuery({
          sql: `
            create table __message (
              "timestamp" blob primary key,
              "table" blob,
              "row" blob,
              "column" blob,
              "value" blob
            ) without rowid;

            create index index__message on __message (
              "table",
              "row",
              "column",
              "timestamp"
            );

            create table __clock (
              "timestamp" blob,
              "merkleTree" blob
            );

            insert into __clock ("timestamp", "merkleTree")
            values ('${timestamp}', '${merkleTree}');

            create table __owner (
              "mnemonic" blob,
              "id" blob,
              "encryptionKey" blob
            );
          
            insert into __owner ("mnemonic", "id", "encryptionKey")
            values (?, ?, ?);
          `,
          parameters: [owner.mnemonic, owner.id, owner.encryptionKey],
        })
      )
    );

const migrateToSlip21Owner: ReaderTaskEither<DbEnv, UnknownError, OwnerEnv> = ({
  db,
}) =>
  pipe(
    apply.sequenceS(taskEither.ApplyPar)({
      createOwner: pipe(
        taskEither.fromTask(() => import("./mnemonic.js")),
        taskEither.map((a) => a.createOwner)
      ),
      mnemonic: pipe(
        db.exec(`select "mnemonic" from __owner limit 1`),
        taskEither.map(([{ mnemonic }]) => mnemonic as Mnemonic)
      ),
    }),
    taskEither.map(
      ({ createOwner, mnemonic }): OwnerEnv => ({
        owner: createOwner(mnemonic),
      })
    ),
    taskEither.chainFirst(({ owner }) =>
      db.execQuery({
        sql: `
          alter table "__owner" add column "encryptionKey" blob;
          update "__owner" set "id" = ?, "encryptionKey" = ?;
        `,
        parameters: [owner.id, owner.encryptionKey],
      })
    )
  );

export const createOwnerEnv = (
  mnemonic?: Mnemonic
): ReaderTaskEither<DbEnv, UnknownError, OwnerEnv> =>
  pipe(
    // For maximum performance, we assume OwnerEnv is already initialized.
    getOwnerEnv,
    readerTaskEither.orElse((e) =>
      e.error.message.includes("no such table: __owner")
        ? lazyInit(mnemonic)
        : e.error.message.includes("no such column: encryptionKey")
        ? migrateToSlip21Owner
        : readerTaskEither.left(e)
    )
  );
