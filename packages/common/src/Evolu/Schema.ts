import * as Kysely from "kysely";
import { pack } from "msgpackr";
import { mapObject, objectToEntries, ReadonlyRecord } from "../Object.js";
import { err, ok, Result } from "../Result.js";
import {
  SafeSql,
  sql,
  SqliteBoolean,
  SqliteDep,
  SqliteError,
  SqliteQuery,
  SqliteQueryOptions,
  SqliteValue,
} from "../Sqlite.js";
import {
  AnyType,
  array,
  BinaryId,
  brand,
  BrandType,
  createTypeErrorFormatter,
  DateIso,
  DateIsoString,
  IdType,
  InferErrors,
  InferInput,
  InferType,
  MergeObjectTypeErrors,
  nullableToOptional,
  NullableToOptionalProps,
  nullOr,
  object,
  ObjectType,
  omit,
  optional,
  OptionalType,
  String,
  Type,
  TypeError,
} from "../Type.js";
import { Simplify } from "../Types.js";
import { AppOwner, OwnerId } from "./Owner.js";
import { maxProtocolMessageRangesSize } from "./Protocol.js";
import { Query, Row } from "./Query.js";
import { CrdtMessage, DbChange } from "./Storage.js";
import { BinaryTimestamp } from "./Timestamp.js";

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
  ReadonlyRecord<string, Type<any, any, any, any, any>>
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
 * 3. Tables cannot use default column names (createdAt, updatedAt, isDeleted)
 * 4. All column types must be compatible with SQLite (extend SqliteValue)
 */
export type ValidateSchema<S extends EvoluSchema> =
  ValidateSchemaHasId<S> extends never
    ? ValidateIdColumnType<S> extends never
      ? ValidateNoDefaultColumns<S> extends never
        ? ValidateColumnTypes<S> extends never
          ? S
          : ValidateColumnTypes<S>
        : ValidateNoDefaultColumns<S>
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
        ? S[TableName]["id"] extends IdType<any>
          ? never
          : SchemaValidationError<`Table "${TableName & string}" id column must be a branded ID type (created with id("${TableName & string}")).`>
        : never
      : never
    : never;

export type ValidateNoDefaultColumns<S extends EvoluSchema> =
  keyof S extends infer TableName
    ? TableName extends keyof S
      ? keyof S[TableName] extends infer ColumnName
        ? ColumnName extends keyof S[TableName]
          ? ColumnName extends "createdAt" | "updatedAt" | "isDeleted"
            ? SchemaValidationError<`Table "${TableName & string}" uses default column name "${ColumnName & string}". Default columns (createdAt, updatedAt, isDeleted) are added automatically.`>
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
  const tables = objectToEntries(schema).map(([tableName, table]) => ({
    name: tableName,
    columns: objectToEntries(table)
      .filter(([k]) => k !== "id")
      .map(([k]) => k),
  }));

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
            readonly [Column in keyof S[Table]]: Column extends
              | "id"
              | "createdAt"
              | "updatedAt"
              ? InferType<S[Table][Column]>
              : InferType<S[Table][Column]> | null;
          } & DefaultColumns;
        } & {
          readonly evolu_history: {
            readonly timestamp: BinaryTimestamp;
            readonly table: keyof S;
            readonly id: BinaryId;
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
 * Default columns automatically added to all tables.
 *
 * - `createdAt`: Set by Evolu when `insert` is called, or can be custom with
 *   `upsert`.
 * - `updatedAt`: Always set by Evolu, derived from {@link CrdtMessage} timestamp.
 *   If you defer sync to avoid leaking time activity, use a custom column to
 *   preserve real update time.
 * - `isDeleted`: Soft delete flag.
 */
export const DefaultColumns = object({
  createdAt: DateIsoString,
  updatedAt: DateIsoString,
  isDeleted: nullOr(SqliteBoolean),
});
export type DefaultColumns = typeof DefaultColumns.Type;

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
 * Evolu has to limit the maximum mutation size. Otherwise, sync couldn't use
 * the {@link maxProtocolMessageRangesSize}. The max size is 640KB in bytes,
 * measured via MessagePack. Evolu Protocol DbChange will be smaller thanks to
 * various optimizations.
 */
export const maxMutationSize = 655360;

const validMutationSize = <T extends AnyType>(type: T) =>
  brand("ValidMutationSize", type, (value) =>
    pack(value).byteLength <= maxMutationSize
      ? ok(value)
      : err<ValidMutationSizeError>({ type: "ValidMutationSize", value }),
  );

export interface ValidMutationSizeError
  extends TypeError<"ValidMutationSize"> {}

export const formatValidMutationSizeError =
  createTypeErrorFormatter<ValidMutationSizeError>(
    (error) =>
      `The mutation size exceeds the maximum limit of ${maxMutationSize} bytes. The provided mutation has a size of ${pack(error.value).byteLength} bytes.`,
  );

export type ValidMutationSize<Props extends Record<string, AnyType>> =
  BrandType<
    ObjectType<Props>,
    "ValidMutationSize",
    ValidMutationSizeError,
    InferErrors<ObjectType<Props>>
  >;

/**
 * Type Factory to create insertable {@link Type}. It makes nullable Types
 * optional, omits Id, and ensures the {@link maxMutationSize}.
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
 * the `id` column partial (i.e. optional) and ensures the
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
 * Type Factory to create upsertable Type. It makes nullable Types optional,
 * includes optional default columns (createdAt, isDeleted), and ensures the
 * {@link maxMutationSize}.
 *
 * ### Example
 *
 * ```ts
 * const UpsertableTodo = upsertable(Schema.todo);
 * type UpsertableTodo = typeof UpsertableTodo.Type;
 * const todo = UpsertableTodo.from({
 *   id,
 *   title,
 *   createdAt: "2023-01-01T00:00:00.000Z",
 * });
 * if (!todo.ok) return; // handle errors
 * ```
 */
export const upsertable = <Props extends Record<string, AnyType>>(
  props: Props,
): ValidMutationSize<UpsertableProps<Props>> => {
  const propsWithDefaults = {
    ...props,
    createdAt: optional(DateIso),
    isDeleted: optional(SqliteBoolean),
  };
  return validMutationSize(nullableToOptional(propsWithDefaults));
};

export type UpsertableProps<Props extends Record<string, AnyType>> =
  NullableToOptionalProps<
    Props & {
      createdAt: OptionalType<typeof DateIso>;
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

export const DbTable = object({
  name: String,
  columns: array(String),
});
export type DbTable = typeof DbTable.Type;

export const DbIndex = object({ name: String, sql: String });
export type DbIndex = typeof DbIndex.Type;

export const DbSchema = object({
  tables: array(DbTable),
  indexes: array(DbIndex),
});
export type DbSchema = typeof DbSchema.Type;

/** Get the current database schema by reading SQLite metadata. */
export const getDbSchema =
  (deps: SqliteDep) =>
  ({ allIndexes = false }: { allIndexes?: boolean } = {}): Result<
    DbSchema,
    SqliteError
  > => {
    const map = new Map<string, Array<string>>();

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
      if (!map.has(tableName)) map.set(tableName, []);
      map.get(tableName)?.push(columnName);
    });

    const tables = Array.from(map, ([name, columns]) => ({ name, columns }));

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
    currentSchema: DbSchema,
    options?: { ignoreIndexes: boolean },
  ): Result<void, SqliteError> => {
    const queries: Array<SqliteQuery> = [];

    newSchema.tables.forEach((newTable) => {
      const currentTable = currentSchema.tables.find(
        (t) => t.name === newTable.name,
      );
      if (!currentTable) {
        queries.push({
          sql: createTableWithDefaultColumns(newTable.name, newTable.columns),
          parameters: [],
        });
      } else {
        newTable.columns
          .filter((newColumn) => !currentTable.columns.includes(newColumn))
          .forEach((newColumn) => {
            queries.push(sql`
              alter table ${sql.identifier(newTable.name)}
              add column ${sql.identifier(newColumn)} blob;
            `);
          });
      }
    });

    if (options?.ignoreIndexes !== true) {
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
    }

    for (const query of queries) {
      const result = deps.sqlite.exec(query);
      if (!result.ok) return result;
    }
    return ok();
  };

const createTableWithDefaultColumns = (
  tableName: string,
  columns: ReadonlyArray<string>,
): SafeSql =>
  `
    create table ${sql.identifier(tableName).sql} (
      "id" text primary key,
      ${columns
        // Add default columns.
        .concat(["createdAt", "updatedAt", "isDeleted"])
        .filter((c) => c !== "id")
        // "A column with affinity BLOB does not prefer one storage class over another
        // and no attempt is made to coerce data from one storage class into another."
        // https://www.sqlite.org/datatype3.html
        .map((name) => `${sql.identifier(name).sql} blob`)
        .join(", ")}
    );
  ` as SafeSql;

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
