import { Kysely, SelectQueryBuilder } from "kysely";
import { pack } from "msgpackr";
import { mapObject, objectToEntries, ReadonlyRecord } from "../Object.js";
import { err, ok, Result } from "../Result.js";
import { SqliteBoolean, SqliteQueryOptions, SqliteValue } from "../Sqlite.js";
import {
  AnyType,
  brand,
  BrandType,
  createTypeErrorFormatter,
  DateIsoString,
  EvoluType,
  Id,
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
  record,
  Type,
  TypeError,
  Unknown,
} from "../Type.js";
import { Simplify } from "../Types.js";
import { DbSchema, DbTable } from "./Db.js";
import { createIndexes, DbIndexesBuilder } from "./Kysely.js";
import { AppOwner, ShardOwner, SharedOwner } from "./Owner.js";
import {
  Base64Url256,
  BinaryId,
  maxProtocolMessageRangesSize,
} from "./Protocol.js";
import { Query, Row } from "./Query.js";
import { BinaryTimestamp } from "./Timestamp.js";

/**
 * Defines the schema of an Evolu database.
 *
 * - Each top-level key represents a table name.
 * - The value for each table name is a record of column names mapped to their
 *   respective data types, defined by {@link Type}.
 * - Each table must include a mandatory `id` column of type {@link Id}.
 * - No table may contain {@link DefaultColumns}.
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
  ReadonlyRecord<string, Type<any, any, any, any, any>> & {
    readonly id: Type<any, any, any, any, any>;
  }
>;

export type CreateQuery<S extends EvoluSchema> = <R extends Row>(
  queryCallback: (
    db: Pick<
      Kysely<
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
            readonly row: BinaryId;
            readonly column: string;
            readonly value: SqliteValue;
          };
        }
      >,
      "selectFrom" | "fn" | "with" | "withRecursive"
    >,
  ) => SelectQueryBuilder<any, any, R>,
  options?: SqliteQueryOptions,
) => Query<Simplify<R>>;

export const DefaultColumns = object({
  createdAt: DateIsoString,
  updatedAt: DateIsoString,
  isDeleted: nullOr(SqliteBoolean),
});
export type DefaultColumns = typeof DefaultColumns.Type;

const isDefaultColumnName = (value: string): boolean =>
  value === "createdAt" || value === "updatedAt" || value === "isDeleted";

/**
 * Valid {@link EvoluSchema}.
 *
 * - Table and column names must be Base64Url strings.
 * - Each table must include an `id` column of type {@link Id}.
 * - Default column names (`createdAt`, `updatedAt`, `isDeleted`) are not allowed.
 */
export const ValidEvoluSchema = brand(
  "ValidEvoluSchema",
  record(
    Base64Url256,
    object({ id: EvoluType }, record(Base64Url256, Unknown)),
  ),
  (value) => {
    for (const tableName in value) {
      for (const columnName in value[tableName as never]) {
        if (isDefaultColumnName(columnName)) {
          return err<ValidEvoluSchemaError>({
            type: "ValidEvoluSchema",
            value,
            reason: {
              kind: "DefaultColumnError",
              tableName,
              columnName,
            },
          });
        }
      }
    }

    return ok(value);
  },
);

export type ValidEvoluSchema = typeof ValidEvoluSchema.Type;

export interface ValidEvoluSchemaError extends TypeError<"ValidEvoluSchema"> {
  readonly reason: {
    kind: "DefaultColumnError";
    tableName: string;
    columnName: string;
  };
}

/**
 * Asserts that the given value is {@link ValidEvoluSchema}.
 *
 * Throws an error if the value is not a valid Evolu schema.
 */
export const assertValidEvoluSchema = (value: unknown): ValidEvoluSchema => {
  const validEvoluSchema = ValidEvoluSchema.fromUnknown(value);
  if (!validEvoluSchema.ok) {
    const message = formatValidEvoluSchemaError(validEvoluSchema.error);
    throw new Error(`Invalid Evolu schema: ${message}`);
  }
  return validEvoluSchema.value;
};

const formatValidEvoluSchemaError = (
  error: typeof ValidEvoluSchema.Error | typeof ValidEvoluSchema.ParentError,
): string => {
  if (error.type === "Record") {
    if (error.reason.kind === "Key") {
      return `The table "${error.reason.key}" has invalid name. A table name must be Base64Url256 string (A-Z, a-z, 0-9, -, _).`;
    }

    if (
      error.reason.kind === "Value" &&
      error.reason.error.reason.kind === "Props" &&
      error.reason.error.reason.errors.id?.type === "EvoluType"
    ) {
      return `The table "${error.reason.key}" has invalid ID column. Check examples.`;
    }

    if (
      error.reason.kind === "Value" &&
      error.reason.error.reason.kind === "IndexKey"
    ) {
      return `The table "${error.reason.key}" has invalid column name "${error.reason.error.reason.key}". A column name must be Base64Url256 string (A-Z, a-z, 0-9, -, _).`;
    }
  }

  if (error.type === "ValidEvoluSchema") {
    return `The table "${error.reason.tableName}" uses reserved column name "${error.reason.columnName}". Reserved column names are: createdAt, updatedAt, isDeleted.`;
  }

  return JSON.stringify(error, null, 2);
};

export const validEvoluSchemaToDbSchema = (
  validEvoluSchema: ValidEvoluSchema,
  indexes?: DbIndexesBuilder,
): DbSchema => {
  const tables = objectToEntries(validEvoluSchema).map(
    ([tableName, table]): DbTable => ({
      name: tableName,
      columns: objectToEntries(table)
        .filter(([k]) => k !== "id")
        .map(([k]) => k as Base64Url256),
    }),
  );
  return {
    tables,
    indexes: createIndexes(indexes),
  };
};

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
  readonly onComplete?: () => void;
  /**
   * Only validate, don't mutate.
   *
   * For example, `onChange` handler can call `insert`/`update`/`upsert` with
   * `onlyValidate: true`.
   */
  readonly onlyValidate?: boolean;

  /**
   * The owner to use for this mutation. Can be a {@link ShardOwner} for sharding
   * app data or a {@link SharedOwner} for collaborative write access. If
   * omitted, defaults to the app's {@link AppOwner}.
   */
  readonly owner?: ShardOwner | SharedOwner;
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
 * Type Factory to create upsertable Type. It makes nullable Types optional and
 * ensures the {@link maxMutationSize}.
 *
 * ### Example
 *
 * ```ts
 * const UpsertableTodo = upsertable(Schema.todo);
 * type UpsertableTodo = typeof UpsertableTodo.Type;
 * const todo = UpsertableTodo.from({ id, title });
 * if (!todo.ok) return; // handle errors
 * ```
 */
export const upsertable = <Props extends Record<string, AnyType>>(
  props: Props,
): ValidMutationSize<UpsertableProps<Props>> =>
  validMutationSize(nullableToOptional(props));

export type UpsertableProps<Props extends Record<string, AnyType>> =
  NullableToOptionalProps<Props>;

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
