import { flow, pipe } from "@effect/data/Function";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as ReadonlyRecord from "@effect/data/ReadonlyRecord";
import { Id, SqliteDate, cast } from "./Model.js";
import { AllowAutoCasting, NewMessage, Owner, Value } from "./Types.js";

export const createNewMessages = (
  table: string,
  row: Id,
  values: ReadonlyRecord.ReadonlyRecord<AllowAutoCasting<Value>>,
  ownerId: Owner["id"],
  now: SqliteDate,
  isInsert: boolean
): ReadonlyArray.NonEmptyReadonlyArray<NewMessage> =>
  pipe(
    ReadonlyRecord.toEntries(values),
    // Filter out undefined and null for inserts. Null is default in SQLite.
    ReadonlyArray.filter(
      ([, value]) => value !== undefined && (isInsert ? value != null : true)
    ),
    ReadonlyArray.map(
      ([key, value]) =>
        [
          key,
          typeof value === "boolean" || value instanceof Date
            ? cast(value as never)
            : value,
        ] as const
    ),
    isInsert
      ? flow(
          ReadonlyArray.append(["createdAt", now]),
          ReadonlyArray.append(["createdBy", ownerId])
        )
      : ReadonlyArray.append(["updatedAt", now]),
    ReadonlyArray.mapNonEmpty(
      ([column, value]): NewMessage => ({ table, row, column, value })
    )
  );

//   const sendMessages =
//   (timestamp: Timestamp) =>
//   (
//     messages: ReadonlyNonEmptyArray<NewCrdtMessage>
//   ): ReaderEither<
//     TimeEnv & ConfigEnv,
//     TimestampDriftError | TimestampCounterOverflowError,
//     {
//       readonly messages: ReadonlyNonEmptyArray<CrdtMessage>;
//       readonly timestamp: Timestamp;
//     }
//   > =>
//     pipe(
//       messages,
//       readerEither.traverseReadonlyNonEmptyArrayWithIndex((i, message) =>
//         pipe(
//           sendTimestamp(timestamp),
//           readerEither.map((t): CrdtMessage => {
//             timestamp = t;
//             return {
//               timestamp: timestampToString(t),
//               table: message.table,
//               row: message.row,
//               column: message.column,
//               value: message.value,
//             };
//           })
//         )
//       ),
//       readerEither.map((messages) => ({ messages, timestamp }))
//     );

// const callSync =
//   ({
//     messages,
//     clock,
//   }: {
//     readonly messages: ReadonlyNonEmptyArray<CrdtMessage>;
//     readonly clock: CrdtClock;
//   }): ReaderTask<PostSyncWorkerInputEnv & OwnerEnv & ConfigEnv, void> =>
//   ({ postSyncWorkerInput, owner, config }) =>
//     task.fromIO(
//       postSyncWorkerInput({
//         syncUrl: config.syncUrl,
//         messages: option.some(messages),
//         clock,
//         owner,
//         previousDiff: option.none,
//       })
//     );

// export const send = ({
//   // messages,
//   // onCompleteIds,
//   // queries,
// }: {
//   // messages: ReadonlyArray.NonEmptyReadonlyArray<NewMessage>;
//   // onCompleteIds: ReadonlyArray<DbWorker.OnCompleteId>;
//   // queries: ReadonlyArray<Db.QueryString>;
// }) => {
//   throw "";
// };

// export const send = ({
//   messages,
//   onCompleteIds,
//   queries,
// }: {
//   readonly messages: ReadonlyNonEmptyArray<NewCrdtMessage>;
//   readonly onCompleteIds: readonly OnCompleteId[];
//   readonly queries: readonly QueryString[];
// }): ReaderTaskEither<
//   DbEnv &
//     OwnerEnv &
//     RowsCacheEnv &
//     PostDbWorkerOutputEnv &
//     PostSyncWorkerInputEnv &
//     TimeEnv &
//     ConfigEnv,
//   UnknownError | TimestampDriftError | TimestampCounterOverflowError,
//   void
// > =>
//   pipe(
//     readClock,
//     readerTaskEither.chainW((clock) =>
//       pipe(
//         messages,
//         sendMessages(clock.timestamp),
//         readerTaskEither.fromReaderEither,
//         readerTaskEither.chainW(({ messages, timestamp }) =>
//           pipe(
//             applyMessages({ merkleTree: clock.merkleTree, messages }),
//             readerTaskEither.map((merkleTree) => ({
//               messages,
//               clock: { merkleTree, timestamp },
//             }))
//           )
//         )
//       )
//     ),
//     readerTaskEither.chainFirstW(({ clock }) => updateClock(clock)),
//     readerTaskEither.chainReaderTaskKW(callSync),
//     readerTaskEither.chainW(() => query({ queries, onCompleteIds }))
//   );
