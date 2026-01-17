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
import { ok, type Result } from "../Result.js";
import {
  type SafeSql,
  sql,
  SqliteBoolean,
  type SqliteDep,
  type SqliteError,
  type SqliteQuery,
  type SqliteQueryOptions,
  SqliteValue,
} from "../Sqlite.js";
import {
  type AnyType,
  array,
  createIdFromString,
  DateIso,
  IdBytes,
  type InferErrors,
  type InferInput,
  type InferType,
  maxMutationSize,
  type MergeObjectTypeErrors,
  nullableToOptional,
  type NullableToOptionalProps,
  nullOr,
  object,
  type ObjectType,
  omit,
  optional,
  type OptionalType,
  record,
  set,
  String,
  type TableId,
  type Type,
  type ValidMutationSize,
  validMutationSize,
  type ValidMutationSizeError,
} from "../Type.js";
import type { Simplify } from "../Types.js";
import type { AppOwner } from "./Owner.js";
import { OwnerId } from "./Owner.js";
import type { Query, Row } from "./Query.js";
import type { CrdtMessage, DbChange } from "./Storage.js";
import { Timestamp, TimestampBytes } from "./Timestamp.js";

/**
 * Defines the schema of an Evolu database.
 *
 * Table schema defines columns that are required for table rows. For not
 * required columns, use {@link nullOr}.
 *
 * ### Example
 *
 * ```ts
 * const TodoId = id("Todo");
 * type TodoId = typeof TodoId.Type;
 *
 * const TodoCategoryId = id("TodoCategory");
 * type TodoCategoryId = typeof TodoCategoryId.Type;
 *
 * const NonEmptyString50 = maxLength(50)(NonEmptyString);
 * type NonEmptyString50 = typeof NonEmptyString50.Type;
 *
 * // Database schema.
 * const Schema = {
 *   todo: {
 *     id: TodoId,
 *     title: NonEmptyString1000,
 *     isCompleted: nullable(SqliteBoolean),
 *     categoryId: nullable(TodoCategoryId),
 *   },
 *   todoCategory: {
 *     id: TodoCategoryId,
 *     name: NonEmptyString50,
 *     json: nullable(SomeJson),
 *   },
 * };
 * ```
 */
export type EvoluSchema = ReadonlyRecord<
  string,
  // TypeScript errors are cryptic so we use ValidateSchema.
  ReadonlyRecord<string, Type<any, any, any, any, any, any>>
>;

/**
 * Validates an {@link EvoluSchema} at compile time, returning the first error
 * found as a readable string literal type. This approach provides much clearer
 * and more actionable TypeScript errors than the default, which are often hard
 * to read.
 *
 * Validates the following schema requirements:
 *
 * 1. All tables must have an 'id' column
 * 2. The 'id' column must be a branded ID type (created with id() function)
 * 3. Tables cannot use system column names (createdAt, updatedAt, isDeleted)
 * 4. All column types must be compatible with SQLite (extend SqliteValue)
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
        ? S[TableName]["id"] extends TableId<any>
          ? never
          : SchemaValidationError<`Table "${TableName & string}" id column must be a branded ID type (created with id("${TableName & string}")).`>
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
          ? InferType<S[TableName][ColumnName]> extends SqliteValue
            ? never
            : SchemaValidationError<`Table "${TableName & string}" column "${ColumnName & string}" type is not compatible with SQLite. Column types must extend SqliteValue (string, number, Uint8Array, or null).`>
          : never
        : never
      : never
    : never;

/** Schema validation error that shows clear, readable messages */
export type SchemaValidationError<Message extends string> =
  `❌ Schema Error: ${Message}`;

export type IndexesConfig = (
  create: (indexName: string) => Kysely.CreateIndexBuilder,
) => ReadonlyArray<Kysely.CreateIndexBuilder<any>>;

export const evoluSchemaToDbSchema = (
  schema: EvoluSchema,
  indexesConfig?: IndexesConfig,
): DbSchema => {
  const tables = mapObject(
    schema,
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

export type CreateQuery<S extends EvoluSchema> = <R extends Row>(
  queryCallback: (
    db: Pick<
      Kysely.Kysely<
        {
          [Table in keyof S]: {
            readonly [Column in keyof S[Table]]: Column extends "id"
              ? InferType<S[Table][Column]>
              : InferType<S[Table][Column]> | null;
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
 * - `createdAt`: Set by Evolu on row creation, derived from {@link Timestamp}.
 * - `updatedAt`: Set by Evolu on every row change, derived from {@link Timestamp}.
 * - `isDeleted`: Soft delete flag created by Evolu and used by the developer to
 *   mark rows as deleted.
 * - `ownerId`: Represents ownership and logically partitions the database.
 */
export const SystemColumns = object({
  createdAt: DateIso,
  updatedAt: DateIso,
  isDeleted: nullOr(SqliteBoolean),
  ownerId: OwnerId,
});
export interface SystemColumns extends InferType<typeof SystemColumns> {}

export const systemColumns = readonly(
  new Set(Object.keys(SystemColumns.props)),
);

export const systemColumnsWithId = readonly([...systemColumns, "id"]);

export type MutationKind = "insert" | "update" | "upsert";

export type Mutation<S extends EvoluSchema, Kind extends MutationKind> = <
  TableName extends keyof S,
>(
  table: TableName,
  props: InferInput<ObjectType<MutationMapping<S[TableName], Kind>>>,
  options?: MutationOptions,
) => Result<
  { readonly id: S[TableName]["id"]["Type"] },
  | ValidMutationSizeError
  | MergeObjectTypeErrors<ObjectType<MutationMapping<S[TableName], Kind>>>
>;

export type MutationMapping<
  P extends Record<string, AnyType>,
  M extends MutationKind,
> = M extends "insert"
  ? InsertableProps<P>
  : M extends "update"
    ? UpdateableProps<P>
    : UpsertableProps<P>;

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

  /**
   * Only validate, don't mutate.
   *
   * For example, `onChange` handler can call `insert`/`update`/`upsert` with
   * `onlyValidate: true`.
   */
  readonly onlyValidate?: boolean;
}

export interface MutationChange extends DbChange {
  /** Owner of the change. If undefined, the change belongs to the AppOwner. */
  readonly ownerId?: OwnerId | undefined;
}

/**
 * Type Factory to create insertable {@link Type}. It makes nullable Types
 * optional (so they are not required), omits Id, and ensures the
 * {@link maxMutationSize}.
 *
 * ### Example
 *
 * ```ts
 * const InsertableTodo = insertable(Schema.todo);
 * type InsertableTodo = typeof InsertableTodo.Type;
 * const todo = InsertableTodo.from({ title });
 * if (!todo.ok) return; // handle errors
 * ```
 */
export const insertable = <Props extends Record<string, AnyType>>(
  props: Props,
): ValidMutationSize<InsertableProps<Props>> => {
  const optionalNullable = nullableToOptional(props);
  const withoutId = omit(optionalNullable, "id");
  return validMutationSize(withoutId);
};

export type InsertableProps<Props extends Record<string, AnyType>> = Omit<
  NullableToOptionalProps<Props>,
  "id"
>;

export type Insertable<Props extends Record<string, AnyType>> = InferInput<
  ObjectType<InsertableProps<Props>>
>;

/**
 * Type Factory to create updateable {@link Type}. It makes everything except for
 * the `id` column optional (so they are not required) and ensures the
 * {@link maxMutationSize}.
 *
 * ### Example
 *
 * ```ts
 * const UpdateableTodo = updateable(Schema.todo);
 * type UpdateableTodo = typeof UpdateableTodo.Type;
 *
 * // `id` is required; all other fields are optional.
 * const todoResult = UpdateableTodo.from({
 *   id: "123",
 *   title: "New Title",
 * });
 * if (!todo.ok) return; // handle errors
 * ```
 */
export const updateable = <Props extends Record<string, AnyType>>(
  props: Props,
): ValidMutationSize<UpdateableProps<Props>> => {
  const propsWithIsDeleted = { ...props, isDeleted: SqliteBoolean };
  const updateableProps = mapObject(propsWithIsDeleted, (value, key) =>
    key === "id" ? value : optional(value),
  ) as UpdateableProps<Props>;
  return validMutationSize(object(updateableProps));
};

export type UpdateableProps<Props extends Record<string, AnyType>> = {
  [K in keyof Props]: K extends "id" ? Props[K] : OptionalType<Props[K]>;
} & { isDeleted: OptionalType<typeof SqliteBoolean> };

export type Updateable<Props extends Record<string, AnyType>> = InferInput<
  ObjectType<UpdateableProps<Props>>
>;

/**
 * Type Factory to create an upsertable Type. It makes nullable Types optional
 * (so they are not required) and ensures the {@link maxMutationSize}.
 *
 * Upsert is like insert, except it requires an ID. It's useful for inserting
 * rows with external ID via {@link createIdFromString}.
 *
 * Note that it's not possible to upsert a row with `createdAt` nor `updatedAt`,
 * because they are derived from {@link CrdtMessage} timestamp. For external
 * createdAt, use a different column.
 *
 * ### Example
 *
 * ```ts
 * const UpsertableTodo = upsertable(Schema.todo);
 * type UpsertableTodo = typeof UpsertableTodo.Type;
 * const todo = UpsertableTodo.from({
 *   id,
 *   title,
 * });
 * if (!todo.ok) return; // handle errors
 * ```
 */
export const upsertable = <Props extends Record<string, AnyType>>(
  props: Props,
): ValidMutationSize<UpsertableProps<Props>> => {
  const propsWithDefaults = {
    ...props,
    isDeleted: optional(SqliteBoolean),
  };
  return validMutationSize(nullableToOptional(propsWithDefaults));
};

export type UpsertableProps<Props extends Record<string, AnyType>> =
  NullableToOptionalProps<
    Props & {
      isDeleted: OptionalType<typeof SqliteBoolean>;
    }
  >;

export type Upsertable<Props extends Record<string, AnyType>> = InferInput<
  ObjectType<UpsertableProps<Props>>
>;

export type InferEvoluSchemaError<S extends EvoluSchema> = {
  [Table in keyof S]: InferMutationTypeErrors<S[Table]>;
}[keyof S];

export type InferMutationTypeErrors<T extends Record<string, AnyType>> =
  | InferColumnErrors<T, "insert">
  | InferColumnErrors<T, "update">
  | InferColumnErrors<T, "upsert">;

export type InferColumnErrors<
  T extends Record<string, AnyType>,
  M extends MutationKind,
> = {
  [Column in keyof MutationMapping<T, M>]: InferErrors<
    MutationMapping<T, M>[Column]
  >;
}[keyof MutationMapping<T, M>];

export const DbIndex = object({ name: String, sql: String });
export interface DbIndex extends InferType<typeof DbIndex> {}

export const DbSchema = object({
  tables: record(String, set(String)),
  indexes: array(DbIndex),
});
export interface DbSchema extends InferType<typeof DbSchema> {}

// TODO: Use a ref and update dbSchema on hot reloading to support
// development workflows where schema changes without full app restart.
export interface DbSchemaDep {
  readonly dbSchema: DbSchema;
}

/** Get the current database schema by reading SQLite metadata. */
export const getDbSchema =
  (deps: SqliteDep) =>
  ({ allIndexes = false }: { allIndexes?: boolean } = {}): Result<
    DbSchema,
    SqliteError
  > => {
    const tables = createRecord<string, Set<string>>();

    const tableAndColumnInfoRows = deps.sqlite.exec(sql`
      select
        sqlite_master.name as tableName,
        table_info.name as columnName
      from
        sqlite_master
        join pragma_table_info(sqlite_master.name) as table_info;
    `);

    if (!tableAndColumnInfoRows.ok) return tableAndColumnInfoRows;

    tableAndColumnInfoRows.value.rows.forEach((row) => {
      const { tableName, columnName } = row as unknown as {
        tableName: string;
        columnName: string;
      };
      (tables[tableName] ??= new Set()).add(columnName);
    });

    const indexesRows = deps.sqlite.exec(
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

    if (!indexesRows.ok) return indexesRows;

    const indexes = indexesRows.value.rows.map(
      (row): DbIndex => ({
        name: row.name as string,
        /**
         * SQLite returns "CREATE INDEX" for "create index" for some reason.
         * Other keywords remain unchanged. We have to normalize the casing for
         * {@link indexesAreEqual} manually.
         */
        sql: (row.sql as string)
          .replace("CREATE INDEX", "create index")
          .replace("CREATE UNIQUE INDEX", "create unique index"),
      }),
    );

    return ok({ tables, indexes });
  };

const indexesAreEqual = (self: DbIndex, that: DbIndex): boolean =>
  self.name === that.name && self.sql === that.sql;

export const ensureDbSchema =
  (deps: SqliteDep) =>
  (
    newSchema: DbSchema,
    currentSchema?: DbSchema,
  ): Result<void, SqliteError> => {
    const queries: Array<SqliteQuery> = [];

    if (!currentSchema) {
      const dbSchema = getDbSchema(deps)();
      if (!dbSchema.ok) return dbSchema;
      currentSchema = dbSchema.value;
    }

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
      const result = deps.sqlite.exec(query);
      if (!result.ok) return result;
    }
    return ok();
  };

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
