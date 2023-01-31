import { readonlyArray, readonlyNonEmptyArray, readonlyRecord } from "fp-ts";
import { flow, pipe } from "fp-ts/lib/function.js";
import type { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import type { ReadonlyRecord } from "fp-ts/ReadonlyRecord";
import { cast, ID, SqliteDateTime } from "./model.js";
import { NewCrdtMessage } from "./types.js";

export const createMessages = (
  table: string,
  row: ID<"string">,
  values: ReadonlyRecord<string, unknown>,
  ownerId: ID<"owner">,
  now: SqliteDateTime,
  isInsert: boolean
): ReadonlyNonEmptyArray<NewCrdtMessage> =>
  pipe(
    readonlyRecord.toEntries(values),
    readonlyArray.filter(([, value]) => value !== undefined),
    readonlyArray.map(([key, value]) => [
      key,
      typeof value === "boolean" || value instanceof Date
        ? cast(value as never)
        : value,
    ]),
    isInsert
      ? flow(
          readonlyArray.appendW(["createdAt", now]),
          readonlyArray.appendW(["createdBy", ownerId])
        )
      : readonlyArray.appendW(["updatedAt", now]),
    readonlyNonEmptyArray.map(
      ([column, value]) =>
        ({
          table,
          row,
          column,
          value,
        } as NewCrdtMessage)
    )
  );
