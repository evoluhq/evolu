import { identity, pipe } from "@effect/data/Function";
import * as Option from "@effect/data/Option";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as ReadonlyRecord from "@effect/data/ReadonlyRecord";
import * as Effect from "@effect/io/Effect";
import { readClock, writeClock } from "./Clock.js";
import { diffMerkleTrees, insertIntoMerkleTree } from "./MerkleTree.js";
import { Id, SqliteDate, cast } from "./Model.js";
import { query } from "./Query.js";
import { ensureSchema } from "./Schema.js";
import {
  createSyncTimestamp,
  receiveTimestamp,
  sendTimestamp,
  timestampToString,
  unsafeTimestampFromString,
} from "./Timestamp.js";
import {
  Config,
  Db,
  DbWorkerOnMessage,
  DbWorkerRowsCache,
  MerkleTree,
  Message,
  NewMessage,
  OnCompleteId,
  Owner,
  Query,
  SyncWorkerPost,
  Time,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampDuplicateNodeError,
  TimestampString,
  Value,
} from "./Types.js";

export const createNewMessages = (
  table: string,
  row: Id,
  values: ReadonlyRecord.ReadonlyRecord<Value | boolean | Date | undefined>,
  ownerId: Owner["id"],
  now: SqliteDate,
  isInsert: boolean
): ReadonlyArray.NonEmptyReadonlyArray<NewMessage> =>
  pipe(
    ReadonlyRecord.toEntries(values),
    ReadonlyArray.filterMap(([key, value]) =>
      value !== undefined && (isInsert ? value != null : true)
        ? Option.some([key, value] as const)
        : Option.none()
    ),
    ReadonlyArray.map(
      ([key, value]) =>
        [
          key,
          typeof value === "boolean"
            ? cast(value)
            : value instanceof Date
            ? cast(value)
            : value,
        ] as const
    ),
    ReadonlyArray.append([isInsert ? "createdAt" : "updatedAt", now] as const),
    isInsert ? ReadonlyArray.append(["createdBy", ownerId]) : identity,
    ReadonlyArray.mapNonEmpty(
      ([column, value]): NewMessage => ({ table, row, column, value })
    )
  );

const applyMessages = ({
  merkleTree,
  messages,
}: {
  merkleTree: MerkleTree;
  messages: ReadonlyArray<Message>;
}): Effect.Effect<Db, never, MerkleTree> =>
  Effect.gen(function* ($) {
    const db = yield* $(Db);

    for (const message of messages) {
      const timestamp: TimestampString | null = yield* $(
        db.exec({
          sql: `
            select "timestamp" FROM "__message"
            where "table" = ? AND
                  "row" = ? AND
                  "column" = ?
            order by "timestamp" desc limit 1
          `,
          parameters: [message.table, message.row, message.column],
        }),
        Effect.flatMap(ReadonlyArray.head),
        Effect.map((row) => row.timestamp as TimestampString),
        Effect.catchTag("NoSuchElementException", () => Effect.succeed(null))
      );

      if (timestamp == null || timestamp < message.timestamp)
        yield* $(
          db.exec({
            sql: `
              insert into "${message.table}" ("id", "${message.column}")
              values (?, ?)
              on conflict do update set "${message.column}" = ?
            `,
            parameters: [message.row, message.value, message.value],
          })
        );

      if (timestamp == null || timestamp !== message.timestamp) {
        yield* $(
          db.exec({
            sql: `
            insert into "__message" (
              "timestamp", "table", "row", "column", "value"
            ) values (?, ?, ?, ?, ?) on conflict do nothing
          `,
            parameters: [
              message.timestamp,
              message.table,
              message.row,
              message.column,
              message.value,
            ],
          })
        );

        const changes = yield* $(db.changes());

        if (changes > 0)
          merkleTree = insertIntoMerkleTree(
            unsafeTimestampFromString(message.timestamp)
          )(merkleTree);
      }
    }

    return merkleTree;
  });

export const sendMessages = ({
  newMessages,
  onCompleteIds,
  queries,
}: {
  readonly newMessages: ReadonlyArray.NonEmptyReadonlyArray<NewMessage>;
  readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
  readonly queries: ReadonlyArray<Query>;
}): Effect.Effect<
  | Db
  | Owner
  | DbWorkerOnMessage
  | SyncWorkerPost
  | Time
  | Config
  | DbWorkerRowsCache,
  TimestampDriftError | TimestampCounterOverflowError,
  void
> =>
  Effect.gen(function* ($) {
    let { timestamp, merkleTree } = yield* $(readClock);

    const messages = yield* $(
      newMessages,
      Effect.forEach((newMessage) =>
        Effect.map(sendTimestamp(timestamp), (nextTimestamp): Message => {
          timestamp = nextTimestamp;
          return {
            timestamp: timestampToString(timestamp),
            table: newMessage.table,
            row: newMessage.row,
            column: newMessage.column,
            value: newMessage.value,
          };
        })
      )
    );

    merkleTree = yield* $(applyMessages({ merkleTree, messages }));

    yield* $(writeClock({ timestamp, merkleTree }));

    const [syncWorkerPost, config, owner] = yield* $(
      Effect.all(SyncWorkerPost, Config, Owner)
    );

    syncWorkerPost({
      _tag: "sync",
      syncUrl: config.syncUrl,
      messages,
      clock: { timestamp, merkleTree },
      owner,
      syncCount: 0,
    });

    if (queries.length > 0 || onCompleteIds.length > 0)
      yield* $(query({ queries, onCompleteIds }));
  });

export const receiveMessages = ({
  messages,
  merkleTree: serverMerkleTree,
  syncCount,
}: {
  readonly messages: ReadonlyArray<Message>;
  readonly merkleTree: MerkleTree;
  readonly syncCount: number;
}): Effect.Effect<
  Db | Time | DbWorkerOnMessage | SyncWorkerPost | Owner | Config,
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampDuplicateNodeError,
  void
> =>
  Effect.gen(function* ($) {
    let { timestamp, merkleTree } = yield* $(readClock);

    for (const message of messages) {
      timestamp = yield* $(
        receiveTimestamp(
          timestamp,
          unsafeTimestampFromString(message.timestamp)
        )
      );
    }

    if (ReadonlyArray.isNonEmptyReadonlyArray(messages))
      yield* $(ensureSchema(messages));

    merkleTree = yield* $(applyMessages({ merkleTree, messages }));

    yield* $(writeClock({ timestamp, merkleTree }));

    const dbWorkerOnMessage = yield* $(DbWorkerOnMessage);
    dbWorkerOnMessage({ _tag: "onReceive" });

    const [syncWorkerPost, config, owner] = yield* $(
      Effect.all(SyncWorkerPost, Config, Owner)
    );

    const diff = diffMerkleTrees(serverMerkleTree, merkleTree);

    if (Option.isNone(diff)) {
      syncWorkerPost({ _tag: "syncCompleted" });

      const now = (yield* $(Time)).now();
      // Should we store lastSyncedAt to __owner table or elsewhere?
      dbWorkerOnMessage({
        _tag: "onSyncState",
        state: { _tag: "SyncStateIsSynced", time: now },
      });
      return;
    }

    const db = yield* $(Db);
    const messagesToSync = yield* $(
      db.exec({
        sql: `select * from "__message" where "timestamp" >= ? order by "timestamp"`,
        parameters: [pipe(diff.value, createSyncTimestamp, timestampToString)],
      }),
      Effect.map((a) => a as unknown as ReadonlyArray<Message>)
    );

    syncWorkerPost({
      _tag: "sync",
      syncUrl: config.syncUrl,
      messages: messagesToSync,
      clock: { timestamp, merkleTree },
      owner,
      syncCount: syncCount + 1,
    });
  });
