import { flow, pipe } from "@effect/data/Function";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as ReadonlyRecord from "@effect/data/ReadonlyRecord";
import * as Db from "./Db.js";
import * as Model from "./Model.js";
import * as Schema from "./Schema.js";
import * as Timestamp from "./Timestamp.js";

export interface NewMessage {
  readonly table: string;
  readonly row: Model.Id;
  readonly column: string;
  readonly value: Db.Value;
}

export interface Message extends NewMessage {
  readonly timestamp: Timestamp.TimestampString;
}

export const createNewMessages = (
  table: string,
  row: Model.Id,
  values: ReadonlyRecord.ReadonlyRecord<Schema.AllowAutoCasting<Db.Value>>,
  ownerId: Db.Owner["id"],
  now: Model.SqliteDate,
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
            ? Model.cast(value as never)
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
