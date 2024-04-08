import * as AST from "@effect/schema/AST";
import * as S from "@effect/schema/Schema";
import { make } from "@effect/schema/Schema";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { Equivalence } from "effect/Equivalence";
import * as Exit from "effect/Exit";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as ReadonlyArray from "effect/ReadonlyArray";
import * as ReadonlyRecord from "effect/ReadonlyRecord";
import * as Scope from "effect/Scope";
import { Config } from "./Config.js";

export class Sqlite extends Context.Tag("Sqlite")<
  Sqlite,
  {
    readonly exec: (query: SqliteQuery) => Effect.Effect<SqliteExecResult>;
    // TODO: Consider execMany, it could make web platform faster.
    readonly transaction: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, Sqlite | R>;
  }
>() {}

/**
 * Usually, Tag and Service can have the same name, but in this case, we create
 * instances dynamically via `createSqlite` and not via Layer, so we need
 * Context.Tag.Service type. Logically, `createSqlite` creates a service, not a
 * tag.
 */
export interface SqliteService extends Context.Tag.Service<typeof Sqlite> {}

export class SqliteFactory extends Context.Tag("SqliteFactory")<
  SqliteFactory,
  {
    readonly createSqlite: Effect.Effect<
      SqliteService,
      never,
      Config | Scope.Scope
    >;
  }
>() {
  static Common = Layer.effect(
    SqliteFactory,
    Effect.map(SqliteFactory, (sqliteFactory) => ({
      createSqlite: Effect.logTrace("SqliteFactory createSqlite").pipe(
        Effect.andThen(sqliteFactory.createSqlite),
        Effect.map(
          (sqlite): SqliteService => ({
            exec: (query) =>
              sqlite.exec(query).pipe(
                Effect.tap((result) => {
                  maybeParseJson(result.rows);
                }),
                Effect.tap((result) =>
                  Effect.logDebug(["SQLite exec", query, result]),
                ),
              ),
            transaction: (effect) =>
              Sqlite.pipe(
                Effect.flatMap((sqlite) =>
                  Effect.acquireUseRelease(
                    sqlite.exec({ sql: "begin" }),
                    () => effect,
                    (_, exit) =>
                      Exit.isFailure(exit)
                        ? sqlite.exec({ sql: "rollback" })
                        : sqlite.exec({ sql: "end" }),
                  ),
                ),
                sqlite.transaction,
              ),
          }),
        ),
      ),
    })),
  );
}

export interface SqliteQuery {
  readonly sql: string;
  readonly parameters?: Value[];
  readonly options?: SqliteQueryOptions;
}

export interface SqliteQueryOptions {
  readonly logQueryExecutionTime?: boolean;
  /** https://www.sqlite.org/eqp.html */
  readonly logExplainQueryPlan?: boolean;
}

export type Value = SqliteValue | JsonObjectOrArray;
export type SqliteValue = null | string | number | Uint8Array;
export type JsonObjectOrArray = JsonObject | JsonArray;
type JsonObject = { [key: string]: Json };
type JsonArray = ReadonlyArray<Json>;
type JsonPrimitive = string | number | boolean | null;
type Json = JsonPrimitive | JsonObject | JsonArray;

export interface SqliteExecResult {
  readonly rows: SqliteRow[];
  readonly changes: number;
}

export type SqliteRow = Record<string, SqliteValue>;

export const isJsonObjectOrArray: Predicate.Refinement<
  Value,
  JsonObjectOrArray
> = (value): value is JsonObjectOrArray =>
  value !== null && typeof value === "object" && !Predicate.isUint8Array(value);

export const valuesToSqliteValues = (
  values: ReadonlyArray<Value>,
): SqliteValue[] =>
  values.map((value) =>
    isJsonObjectOrArray(value) ? JSON.stringify(value) : value,
  );

/** This function mutates for better performance. */
export const maybeParseJson = (rows: SqliteRow[]): void => {
  parseArray(rows);
};

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

/** This is good enough detection because SQL strings in Evolu are predictable. */
const isSqlMutationRegEx = new RegExp(
  `\\b(${[
    "alter",
    "create",
    "delete",
    "drop",
    "insert",
    "replace",
    "update",
  ].join("|")})\\b`,
);

export const isSqlMutation = (sql: string): boolean =>
  isSqlMutationRegEx.test(sql);

export const maybeLogSqliteQueryExecutionTime =
  (query: SqliteQuery) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    if (!query.options?.logQueryExecutionTime) return effect;
    return Effect.Do.pipe(
      Effect.let("start", () => performance.now()),
      Effect.bind("result", () => effect),
      Effect.let("elapsed", ({ start }) => performance.now() - start),
      Effect.tap(({ elapsed }) =>
        Console.log(`QueryExecutionTime: ${elapsed}ms`, query),
      ),
      Effect.map(({ result }) => result),
    );
  };

export type SqliteQueryPlanRow = {
  id: number;
  parent: number;
  detail: string;
};

export const drawSqliteQueryPlan = (rows: SqliteQueryPlanRow[]): string =>
  rows
    .map((row) => {
      let parentId = row.parent;
      let indent = 0;

      do {
        const parent = rows.find((r) => r.id === parentId);
        if (!parent) break;
        parentId = parent.parent;
        indent++;
        // eslint-disable-next-line no-constant-condition
      } while (true);

      return `${"  ".repeat(indent)}${row.detail}`;
    })
    .join("\n");

export interface SqliteSchema {
  readonly tables: ReadonlyArray<Table>;
  readonly indexes: ReadonlyArray<Index>;
}

export const createSqliteSchema = (
  schema: S.Schema<any>,
): Effect.Effect<SqliteSchema, never, Config> =>
  Effect.map(Config, (config) => ({
    tables: schemaToTables(schema),
    indexes: config?.indexes,
  }));

const schemaToTables = (schema: S.Schema<any>) =>
  pipe(
    getPropertySignatures(schema),
    ReadonlyRecord.toEntries,
    ReadonlyArray.map(
      ([name, schema]): Table => ({
        name,
        columns: Object.keys(getPropertySignatures(schema)),
      }),
    ),
  );

// TODO: https://discord.com/channels/795981131316985866/1218626687546294386/1218796529725476935
// https://github.com/Effect-TS/schema/releases/tag/v0.18.0
const getPropertySignatures = <I extends { [K in keyof A]: any }, A>(
  schema: S.Schema<A, I>,
): { [K in keyof A]: S.Schema<A[K], I[K]> } => {
  const out: Record<PropertyKey, S.Schema<any>> = {};
  const propertySignatures = AST.getPropertySignatures(schema.ast);
  for (let i = 0; i < propertySignatures.length; i++) {
    const propertySignature = propertySignatures[i];
    out[propertySignature.name] = make(propertySignature.type);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return out as any;
};

export interface Table {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

// TODO: Rename to SqliteIndex
export const Index = S.struct({
  name: S.string,
  sql: S.string,
});
export type Index = S.Schema.Type<typeof Index>;

// TODO: Rename to sqliteIndexEquivalence
export const indexEquivalence: Equivalence<Index> = (self, that) =>
  self.name === that.name && self.sql === that.sql;
