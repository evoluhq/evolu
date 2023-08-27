import { Brand, Context, Effect, ReadonlyRecord } from "effect";

interface ExecResult {
  readonly rows: ReadonlyArray<Row>;
  readonly changes: number;
}

export interface Sqlite {
  readonly exec: (
    arg: string | QueryObject,
  ) => Effect.Effect<never, never, ExecResult>;
}

export const Sqlite = Context.Tag<Sqlite>("evolu/Sqlite");

export interface QueryObject {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Value>;
}

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord.ReadonlyRecord<Value>;

export type Query = string & Brand.Brand<"Query">;

export const queryObjectToQuery = ({ sql, parameters }: QueryObject): Query =>
  JSON.stringify({ sql, parameters }) as Query;

export const queryObjectFromQuery = (s: Query): QueryObject =>
  JSON.parse(s) as QueryObject;

// A workaround for expo-sqlite not supporting binary array.
export const fixExpoSqliteBinding = (array: Uint8Array): Uint8Array => {
  if (typeof array !== "string") return array;
  return new Uint8Array(
    (array as string)
      .replace("{", "")
      .replace("}", "")
      .trim()
      .split(";")
      .map((i) => i.trim())
      .filter((i) => i.length > 0)
      .map((i) => {
        const [index, value] = i.split(" = ").map(Number);
        return { index, value };
      })
      .sort((a, b) => a.index - b.index)
      .map((i) => i.value),
  );
};
