import { Context, Effect, Predicate } from "effect";

export interface Sqlite {
  readonly exec: (
    arg: string | SqliteQuery,
  ) => Effect.Effect<never, never, ExecResult>;
}

export const Sqlite = Context.Tag<Sqlite>();

export interface SqliteQuery {
  readonly sql: string;
  readonly parameters: SqliteValue[];
}

export type SqliteValue = null | string | number | Uint8Array;

interface ExecResult {
  readonly rows: SqliteRow[];
  readonly changes: number;
}

export type SqliteRow = Record<string, SqliteValue>;

export const ensureSqliteQuery = (arg: string | SqliteQuery): SqliteQuery => {
  if (typeof arg !== "string") return arg;
  return { sql: arg, parameters: [] };
};

export const maybeParseJson = (rows: SqliteRow[]): SqliteRow[] =>
  parseArray(rows);

const parseArray = <T>(a: T[]): T[] => {
  for (let i = 0; i < a.length; ++i) a[i] = parse(a[i]) as T;
  return a;
};

const parse = (o: unknown): unknown => {
  if (Predicate.isString(o)) return parseString(o);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  if (Array.isArray(o)) return parseArray(o);
  if (typeof o === "object" && o !== null && !Predicate.isUint8Array(o))
    return parseObject(o as Record<string, unknown>);
  return o;
};

const parseString = (s: string): unknown => {
  if (maybeJson(s))
    try {
      return parse(JSON.parse(s));
    } catch (err) {
      // Nothing to do.
    }
  return s;
};

export const maybeJson: Predicate.Predicate<string> = (value) =>
  value.match(/^[[{]/) != null;

const parseObject = (o: Record<string, unknown>): Record<string, unknown> => {
  for (const key in o) o[key] = parse(o[key]);
  return o;
};
