/**
 * Database schema definition and validation.
 *
 * @module
 */

import * as Kysely from "kysely";
import { readonly } from "../Function.js";
import {
  createRecord,
  getProperty,
  mapObject,
  type ReadonlyRecord,
} from "../Object.js";
import {
  type SafeSql,
  sql,
  SqliteBoolean,
  type SqliteDep,
  type SqliteQuery,
  type SqliteQueryOptions,
  SqliteValue,
} from "../Sqlite.js";
import type { InferType } from "../Type.js";
import {
  array,
  DateIso,
  type Id,
  IdBytes,
  nullOr,
  object,
  record,
  set,
  type StandardSchemaV1,
  String,
} from "../Type.js";
import type { Simplify } from "../Types.js";
import type { AppOwner } from "./Owner.js";
import { OwnerId } from "./Owner.js";
import type { Query, Row } from "./Query.js";
import { serializeQuery } from "./Query.js";
import type { CrdtMessage, DbChange } from "./Storage.js";
import { TimestampBytes } from "./Timestamp.js";

/** Any {@link StandardSchemaV1}. */
export type AnyStandardSchemaV1 = StandardSchemaV1<any, any>;

/**
 * Defines the schema of an Evolu database.
 *
 * Column types are Standard Schema v1 compatible — use Evolu Type, Zod,
 * Valibot, ArkType, or any library that implements Standard Schema.
 *
 * Table schema defines columns that are required for table rows. For optional
 * columns, use a schema whose output type includes `null`.
 *
 * ### Example
 *
 * ```ts
 * // With Evolu Type
 * const TodoId = id("Todo");
 * type TodoId = typeof TodoId.Type;
 *
 * const Schema = {
 *   todo: {
 *     id: TodoId,
 *     title: NonEmptyString100,
 *     isCompleted: nullOr(SqliteBoolean),
 *   },
 * };
 *
 * // With Zod (or any Standard Schema library)
 * const Schema = {
 *   todo: {
 *     id: TodoId, // Evolu id() for branded IDs
 *     title: z.string().min(1).max(100),
 *     isCompleted: z.union([z.literal(0), z.literal(1)]).nullable(),
 *   },
 * };
 * ```
 */
export type EvoluSchema = ReadonlyRecord<
  string,
  // TypeScript errors are cryptic so we use ValidateSchema.
  TableSchema
>;

/** A table schema: column names mapped to Standard Schema validators. */
export type TableSchema = ReadonlyRecord<string, AnyStandardSchemaV1>;

/**
 * Validates an {@link EvoluSchema} at compile time, returning the first error
 * found as a readable string literal type. This approach provides much clearer
 * and more actionable TypeScript errors than the default, which are often hard
 * to read.
 *
 * Validates the following schema requirements:
 *
 * 1. All tables must have an 'id' column
 * 2. The 'id' column output type must extend {@link Id}
 * 3. Tables cannot use system column names (createdAt, updatedAt, isDeleted)
 * 4. All column output types must be compatible with SQLite (extend SqliteValue)
 */
export type ValidateSchema<S extends EvoluSchema> =
  ValidateSchemaHasId<S> extends never
    ? ValidateIdColumnType<S> extends never
      ? ValidateNoSystemColumns<S> extends never
        ? ValidateColumnTypes<S> extends never
          ? S
          : ValidateColumnTypes<S>
        : ValidateNoSystemColumns<S>
      : ValidateIdColumnType<S>
    : ValidateSchemaHasId<S>;

export type IndexesConfig = (
  create: (indexName: string) => Kysely.CreateIndexBuilder,
) => ReadonlyArray<Kysely.CreateIndexBuilder<any>>;

export type CreateQuery<S extends EvoluSchema> = <R extends Row>(
  queryCallback: (
    db: Pick<
      Kysely.Kysely<
        {
          [Table in keyof S]: {
            readonly [Column in keyof S[Table]]: Column extends "id"
              ? StandardSchemaV1.InferOutput<S[Table][Column]>
              : StandardSchemaV1.InferOutput<S[Table][Column]> | null;
          } & SystemColumns;
        } & {
          readonly evolu_history: {
            readonly timestamp: TimestampBytes;
            readonly table: keyof S;
            readonly id: IdBytes;
            readonly column: string;
            readonly value: SqliteValue;
          };
          readonly evolu_message_quarantine: {
            readonly timestamp: TimestampBytes;
            readonly table: string;
            readonly id: IdBytes;
            readonly column: string;
            readonly value: SqliteValue;
          };
        }
      >,
      "selectFrom" | "fn" | "with" | "withRecursive"
    >,
  ) => Kysely.SelectQueryBuilder<any, any, R>,
  options?: SqliteQueryOptions,
) => Query<Simplify<R>>;

/**
 * System columns that are implicitly defined by Evolu.
 *
 * - `createdAt`: Set by Evolu on row creation, derived from Timestamp.
 * - `updatedAt`: Set by Evolu on every row change, derived from Timestamp.
 * - `isDeleted`: Soft delete flag created by Evolu and used by the developer to
 *   mark rows as deleted.
 * - `ownerId`: Represents ownership and logically partitions the database.
 */
export const SystemColumns = /*#__PURE__*/ object({
  createdAt: DateIso,
  updatedAt: DateIso,
  isDeleted: nullOr(SqliteBoolean),
  ownerId: OwnerId,
});
export interface SystemColumns extends InferType<typeof SystemColumns> {}

export type MutationKind = "insert" | "update" | "upsert";

/**
 * Mutation function type. Accepts already-validated values — validation is the
 * caller's responsibility using any Standard Schema library (Evolu Type, Zod,
 * Valibot, ArkType, etc.).
 *
 * Evolu does not use SQL for mutations to ensure data can be deterministically
 * merged without conflicts. Explicit mutations also allow Evolu to
 * automatically update {@link SystemColumns} and encourage developers to
 * consider the number of changes produced, unlike SQL where a single query can
 * inadvertently generate a large volume of CRDT messages. Each mutation
 * produces exactly one {@link CrdtMessage} containing all provided columns.
 *
 * Mutations never fail — values are already validated by the caller, and
 * changes are stored locally in SQLite.
 *
 * - **insert**: all non-nullable columns required, nullable columns optional,
 *   `id` omitted (auto-generated)
 * - **update**: only `id` required, everything else optional
 * - **upsert**: like insert but `id` required too
 */
export type Mutation<S extends EvoluSchema, Kind extends MutationKind> = <
  TableName extends keyof S,
>(
  table: TableName,
  values: MutationValues<S[TableName], Kind>,
  options?: MutationOptions,
) => { readonly id: StandardSchemaV1.InferOutput<S[TableName]["id"]> };

export interface MutationOptions {
  /**
   * Called after the mutation is completed and the local state is updated.
   * Useful for triggering side effects (e.g., notifications, UI updates) after
   * insert, update, or upsert.
   */
  readonly onComplete?: () => void;

  /**
   * Specifies the owner ID for this mutation. If omitted, the default
   * {@link AppOwner} is used.
   *
   * The owner must be used with `evolu.useOwner()` to enable sync. Mutations
   * with unused owners are stored locally but not synced until the owner is
   * used.
   *
   * ### Example
   *
   * ```ts
   * // Partition your own data by project (derived from your AppOwner)
   * const projectOwner = deriveShardOwner(appOwner, [
   *   "project",
   *   projectId,
   * ]);
   * evolu.insert(
   *   "task",
   *   { title: "Task 1" },
   *   { ownerId: projectOwner.id },
   * );
   *
   * // Collaborative data (independent owner shared with others)
   * const sharedOwner = createSharedOwner(sharedSecret);
   * evolu.insert(
   *   "comment",
   *   { text: "Hello" },
   *   { ownerId: sharedOwner.id },
   * );
   * ```
   */
  readonly ownerId?: OwnerId;
}

export interface MutationChange extends DbChange {
  /** Owner of the change. If undefined, the change belongs to the AppOwner. */
  readonly ownerId?: OwnerId | undefined;
}

/**
 * Derives the expected values type for a mutation from a table's column schemas
 * and a {@link MutationKind}.
 */
export type MutationValues<
  T extends TableSchema,
  M extends MutationKind,
> = Simplify<
  M extends "insert"
    ? InsertValues<T>
    : M extends "update"
      ? UpdateValues<T>
      : UpsertValues<T>
>;

/**
 * Insert values: `id` omitted (auto-generated), nullable columns optional,
 * non-nullable columns required.
 */
export type InsertValues<T extends TableSchema> = Omit<
  NullableColumnsToOptional<T>,
  "id"
>;

/**
 * Update values: `id` required, all other columns optional. Includes
 * `isDeleted` for soft deletes.
 */
export type UpdateValues<T extends TableSchema> = {
  readonly id: StandardSchemaV1.InferOutput<T["id"]>;
} & {
  readonly [K in Exclude<keyof T, "id">]?: StandardSchemaV1.InferOutput<T[K]>;
} & {
  readonly isDeleted?: SqliteBoolean;
};

/**
 * Upsert values: `id` required, nullable columns optional, non-nullable columns
 * required. Includes `isDeleted` for soft deletes.
 */
export type UpsertValues<T extends TableSchema> =
  NullableColumnsToOptional<T> & {
    readonly isDeleted?: SqliteBoolean;
  };

export const DbIndex = /*#__PURE__*/ object({ name: String, sql: String });
export interface DbIndex extends InferType<typeof DbIndex> {}

export const DbSchema = /*#__PURE__*/ object({
  tables: record(String, set(String)),
  indexes: array(DbIndex),
});
export interface DbSchema extends InferType<typeof DbSchema> {}

// TODO: Use a ref and update dbSchema on hot reloading to support
// development workflows where schema changes without full app restart.
export interface DbSchemaDep {
  readonly dbSchema: DbSchema;
}

export type ValidateSchemaHasId<S extends EvoluSchema> =
  keyof S extends infer TableName
    ? TableName extends keyof S
      ? "id" extends keyof S[TableName]
        ? never
        : SchemaValidationError<`Table "${TableName & string}" is missing required id column.`>
      : never
    : never;

export type ValidateIdColumnType<S extends EvoluSchema> =
  keyof S extends infer TableName
    ? TableName extends keyof S
      ? "id" extends keyof S[TableName]
        ? StandardSchemaV1.InferOutput<S[TableName]["id"]> extends Id
          ? never
          : SchemaValidationError<`Table "${TableName & string}" id column output type must extend Id. Use id("${TableName & string}") from Evolu Type.`>
        : never
      : never
    : never;

export type ValidateNoSystemColumns<S extends EvoluSchema> =
  keyof S extends infer TableName
    ? TableName extends keyof S
      ? keyof S[TableName] extends infer ColumnName
        ? ColumnName extends keyof S[TableName]
          ? ColumnName extends
              | "createdAt"
              | "updatedAt"
              | "isDeleted"
              | "ownerId"
            ? SchemaValidationError<`Table "${TableName & string}" uses system column name "${ColumnName & string}". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.`>
            : never
          : never
        : never
      : never
    : never;

export type ValidateColumnTypes<S extends EvoluSchema> =
  keyof S extends infer TableName
    ? TableName extends keyof S
      ? keyof S[TableName] extends infer ColumnName
        ? ColumnName extends keyof S[TableName]
          ? StandardSchemaV1.InferOutput<
              S[TableName][ColumnName]
            > extends SqliteValue
            ? never
            : SchemaValidationError<`Table "${TableName & string}" column "${ColumnName & string}" type is not compatible with SQLite. Column types must extend SqliteValue (string, number, Uint8Array, or null).`>
          : never
        : never
      : never
    : never;

/** Schema validation error that shows clear, readable messages */
export type SchemaValidationError<Message extends string> =
  `❌ Schema Error: ${Message}`;

/** Makes columns whose output type includes `null` optional. */
export type NullableColumnsToOptional<T extends TableSchema> = {
  readonly [K in RequiredColumnKeys<T>]: StandardSchemaV1.InferOutput<T[K]>;
} & {
  readonly [K in OptionalColumnKeys<T>]?: StandardSchemaV1.InferOutput<T[K]>;
};

export type RequiredColumnKeys<T extends TableSchema> = {
  [K in keyof T]: null extends StandardSchemaV1.InferOutput<T[K]> ? never : K;
}[keyof T];

export type OptionalColumnKeys<T extends TableSchema> = {
  [K in keyof T]: null extends StandardSchemaV1.InferOutput<T[K]> ? K : never;
}[keyof T];

export const systemColumns = /*#__PURE__*/ readonly(
  new Set(Object.keys(SystemColumns.props)),
);

export const systemColumnsWithId = /*#__PURE__*/ readonly([
  ...systemColumns,
  "id",
]);

export const evoluSchemaToDbSchema = <S extends EvoluSchema>(
  schema: ValidateSchema<S> extends never ? S : ValidateSchema<S>,
  indexesConfig?: IndexesConfig,
): DbSchema => {
  const validSchema = schema as EvoluSchema;

  const tables = mapObject(
    validSchema,
    (table) => new Set(Object.keys(table).filter((k) => k !== "id")),
  );

  const indexes = indexesConfig
    ? indexesConfig(createIndex).map(
        (index): DbIndex => ({
          name: index.toOperationNode().name.name,
          sql: index.compile().sql,
        }),
      )
    : [];

  return { tables, indexes };
};

/**
 * Creates a query builder from a {@link EvoluSchema}.
 *
 * ### Example
 *
 * ```ts
 * const Schema = {
 *   todo: {
 *     id: id("Todo"),
 *     title: NonEmptyString100,
 *     isCompleted: nullOr(SqliteBoolean),
 *   },
 * };
 *
 * // Create a typed query builder (once per schema)
 * const createQuery = createQueryBuilder(Schema);
 *
 * // Use it for all queries
 * const todosQuery = createQuery((db) =>
 *   db.selectFrom("todo").select(["id", "title", "isCompleted"]),
 * );
 * ```
 */
export const createQueryBuilder =
  <S extends EvoluSchema>(_schema: S): CreateQuery<S> =>
  (queryCallback, options) => {
    const compiledQuery = queryCallback(kysely as never).compile();

    return serializeQuery({
      sql: compiledQuery.sql as SafeSql,
      parameters: compiledQuery.parameters as NonNullable<
        SqliteQuery["parameters"]
      >,
      ...(options && { options }),
    });
  };

/** Get the current database schema by reading SQLite metadata. */
export const getDbSchema =
  (deps: SqliteDep) =>
  ({ allIndexes = false }: { allIndexes?: boolean } = {}): DbSchema => {
    const tables = createRecord<string, Set<string>>();

      const tableAndColumnInfoRows = deps.sqlite.exec<{
        tableName: string;
        columnName: string;
      }>(sql`
        select
          sqlite_master.name as tableName,
          table_info.name as columnName
        from
          sqlite_master
          join pragma_table_info(sqlite_master.name) as table_info;
      `);

      tableAndColumnInfoRows.rows.forEach(({ tableName, columnName }) => {
        (tables[tableName] ??= new Set()).add(columnName);
      });

      const indexesRows = deps.sqlite.exec<{ name: string; sql: string | null }>(
        allIndexes
          ? sql`
              select name, sql
              from sqlite_master
              where type = 'index' and name not like 'sqlite_%';
            `
          : sql`
              select name, sql
              from sqlite_master
              where
                type = 'index'
                and name not like 'sqlite_%'
                and name not like 'evolu_%';
            `,
      );

    const indexes = indexesRows.rows.flatMap((row): Array<DbIndex> => {
      if (row.sql == null) return [];
      return [
        {
          name: row.name,
          /**
           * SQLite returns "CREATE INDEX" for "create index" for some reason.
           * Other keywords remain unchanged. We have to normalize the casing for
           * {@link indexesAreEqual} manually.
           */
          sql: row.sql
            .replace("CREATE INDEX", "create index")
            .replace("CREATE UNIQUE INDEX", "create unique index"),
        },
      ];
    });

    return { tables, indexes };
  };

export const ensureDbSchema =
  (deps: SqliteDep) =>
  (newSchema: DbSchema, currentSchema?: DbSchema): void => {
    const queries: Array<SqliteQuery> = [];

    currentSchema ??= getDbSchema(deps)();

    for (const [tableName, newColumns] of Object.entries(newSchema.tables)) {
      const currentColumns = getProperty(currentSchema.tables, tableName);
      if (!currentColumns) {
        queries.push(createAppTable(tableName, newColumns));
      } else {
        for (const newColumn of newColumns.difference(currentColumns)) {
          queries.push(sql`
            alter table ${sql.identifier(tableName)}
            add column ${sql.identifier(newColumn)} any;
          `);
        }
      }
    }

    // Remove current indexes that are not in the newSchema.
    currentSchema.indexes
      .filter(
        (currentIndex) =>
          !newSchema.indexes.some((newIndex) =>
            indexesAreEqual(newIndex, currentIndex),
          ),
      )
      .forEach((index) => {
        queries.push(sql`drop index ${sql.identifier(index.name)};`);
      });

    // Add new indexes that are not in the currentSchema.
    newSchema.indexes
      .filter(
        (newIndex) =>
          !currentSchema.indexes.some((currentIndex) =>
            indexesAreEqual(newIndex, currentIndex),
          ),
      )
      .forEach((newIndex) => {
        queries.push({ sql: `${newIndex.sql};` as SafeSql, parameters: [] });
      });

    for (const query of queries) {
      deps.sqlite.exec(query);
    }
  };

// https://kysely.dev/docs/recipes/splitting-query-building-and-execution
export const kysely = new Kysely.Kysely({
  dialect: {
    createAdapter: () => new Kysely.SqliteAdapter(),
    createDriver: () => new Kysely.DummyDriver(),
    createIntrospector() {
      throw new Error("Not implemeneted");
    },
    createQueryCompiler: () => new Kysely.SqliteQueryCompiler(),
  },
});

const createIndex = kysely.schema.createIndex.bind(kysely.schema);

const indexesAreEqual = (self: DbIndex, that: DbIndex): boolean =>
  self.name === that.name && self.sql === that.sql;

const createAppTable = (tableName: string, columns: ReadonlySet<string>) => sql`
  create table ${sql.identifier(tableName)} (
    "id" text,
    ${sql.raw(
      // With strict tables and any type, data is preserved exactly as received
      // without any type affinity coercion. This allows storing any data type
      // while maintaining strict null enforcement for primary key columns.
      // TODO: Use proper SQLite types for system columns (text for createdAt,
      // updatedAt, ownerId, integer for isDeleted) instead of "any".
      [...systemColumns, ...columns]
        .map((name) => `${sql.identifier(name).sql} any`)
        .join(", "),
    )},
    primary key ("ownerId", "id")
  )
  without rowid, strict;
`;
