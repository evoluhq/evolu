import {
  AliasableExpression,
  AliasNode,
  ColumnNode,
  Expression,
  ExpressionWrapper,
  IdentifierNode,
  RawBuilder,
  ReferenceNode,
  SelectQueryNode,
  Simplify,
  sql,
  TableNode,
  ValueNode,
} from "kysely";
import { kyselyJsonIdentifier } from "./Query.js";

export { sql } from "kysely";
export type { NotNull } from "kysely";

/**
 * A SQLite helper for aggregating a subquery into a JSON array.
 *
 * ### Example
 *
 * ```ts
 * import { kysely } from "@evolu/common";
 *
 * // TODO: Update for Evolu
 * const result = await db
 *   .selectFrom("person")
 *   .select((eb) => [
 *     "id",
 *     kysely
 *       .jsonArrayFrom(
 *         eb
 *           .selectFrom("pet")
 *           .select(["pet.id as pet_id", "pet.name"])
 *           .whereRef("pet.owner_id", "=", "person.id")
 *           .orderBy("pet.name"),
 *       )
 *       .as("pets"),
 *   ])
 *   .execute();
 *
 * result[0]?.id;
 * result[0]?.pets[0].pet_id;
 * result[0]?.pets[0].name;
 * ```
 *
 * The generated SQL (SQLite):
 *
 * ```sql
 * select "id", (
 *   select coalesce(json_group_array(json_object(
 *     'pet_id', "agg"."pet_id",
 *     'name', "agg"."name"
 *   )), '[]') from (
 *     select "pet"."id" as "pet_id", "pet"."name"
 *     from "pet"
 *     where "pet"."owner_id" = "person"."id"
 *     order by "pet"."name"
 *   ) as "agg"
 * ) as "pets"
 * from "person"
 * ```
 */
// Kysely expects strict AST.
// prettier-ignore
export function jsonArrayFrom<O>(
    expr: SelectQueryBuilderExpression<O>,
  ): RawBuilder<Array<Simplify<O>>> {
    return sql`(select ${sql.lit(kyselyJsonIdentifier)} || coalesce(json_group_array(json_object(${sql.join(
      getSqliteJsonObjectArgs(expr.toOperationNode(), 'agg'),
    )})), '[]') from ${expr} as agg)`
  }

/**
 * A SQLite helper for turning a subquery into a JSON object.
 *
 * The subquery must only return one row.
 *
 * ### Example
 *
 * ```ts
 * import { kysely } from "@evolu/common";
 *
 * // TODO: Update for Evolu
 * const result = await db
 *   .selectFrom("person")
 *   .select((eb) => [
 *     "id",
 *     jsonObjectFrom(
 *       eb
 *         .selectFrom("pet")
 *         .select(["pet.id as pet_id", "pet.name"])
 *         .whereRef("pet.owner_id", "=", "person.id")
 *         .where("pet.is_favorite", "=", true),
 *     ).as("favorite_pet"),
 *   ])
 *   .execute();
 *
 * result[0]?.id;
 * result[0]?.favorite_pet?.pet_id;
 * result[0]?.favorite_pet?.name;
 * ```
 *
 * The generated SQL (SQLite):
 *
 * ```sql
 * select "id", (
 *   select json_object(
 *     'pet_id', "obj"."pet_id",
 *     'name', "obj"."name"
 *   ) from (
 *     select "pet"."id" as "pet_id", "pet"."name"
 *     from "pet"
 *     where "pet"."owner_id" = "person"."id"
 *     and "pet"."is_favorite" = ?
 *   ) as obj
 * ) as "favorite_pet"
 * from "person";
 * ```
 */
// Kysely expects strict AST.
// prettier-ignore
export function jsonObjectFrom<O>(
    expr: SelectQueryBuilderExpression<O>,
  ): RawBuilder<Simplify<O> | null> {
    return sql`(select ${sql.lit(kyselyJsonIdentifier)} || json_object(${sql.join(
      getSqliteJsonObjectArgs(expr.toOperationNode(), 'obj'),
    )}) from ${expr} as obj)`
  }

/**
 * The SQLite `json_object` function.
 *
 * ### Example
 *
 * ```ts
 * import { kysely } from "@evolu/common";
 *
 * // TODO: Update for Evolu
 * const result = await db
 *   .selectFrom("person")
 *   .select((eb) => [
 *     "id",
 *     kysely
 *       .jsonBuildObject({
 *         first: eb.ref("first_name"),
 *         last: eb.ref("last_name"),
 *         full: kysely.sql<string>`first_name || ' ' || last_name`,
 *       })
 *       .as("name"),
 *   ])
 *   .execute();
 *
 * result[0]?.id;
 * result[0]?.name.first;
 * result[0]?.name.last;
 * result[0]?.name.full;
 * ```
 *
 * The generated SQL (SQLite):
 *
 * ```sql
 * select "id", json_object(
 *   'first', first_name,
 *   'last', last_name,
 *   'full', "first_name" || ' ' || "last_name"
 * ) as "name"
 * from "person"
 * ```
 */
// Kysely expects strict AST.
// prettier-ignore
export function jsonBuildObject<O extends Record<string, Expression<unknown>>>(
    obj: O,
  ): RawBuilder<
    Simplify<{
      [K in keyof O]: O[K] extends Expression<infer V> ? V : never
    }>
  > {
    return sql`${sql.lit(kyselyJsonIdentifier)} || json_object(${sql.join(
      Object.keys(obj).flatMap((k) => [sql.lit(k), obj[k]]),
    )})`
  }

interface SelectQueryBuilderExpression<O> extends AliasableExpression<O> {
  get isSelectQueryBuilder(): true;
  toOperationNode(): SelectQueryNode;
}

function getSqliteJsonObjectArgs(
  node: SelectQueryNode,
  table: string,
): Array<Expression<unknown> | string> {
  try {
    return getJsonObjectArgs(node, table);
  } catch {
    throw new Error(
      "SQLite jsonArrayFrom and jsonObjectFrom functions can only handle explicit selections due to limitations of the json_object function. selectAll() is not allowed in the subquery.",
    );
  }
}

export function getJsonObjectArgs(
  node: SelectQueryNode,
  table: string,
): Array<Expression<unknown> | string> {
  const args: Array<Expression<unknown> | string> = [];
  
  for (const { selection: s } of node.selections ?? []) {
    if (ReferenceNode.is(s) && ColumnNode.is(s.column)) {
      args.push(
        colName(s.column.column.name),
        colRef(table, s.column.column.name),
      );
    } else if (ColumnNode.is(s)) {
      args.push(colName(s.column.name), colRef(table, s.column.name));
    } else if (AliasNode.is(s) && IdentifierNode.is(s.alias)) {
      args.push(colName(s.alias.name), colRef(table, s.alias.name));
    } else {
      throw new Error(`can't extract column names from the select query node`);
    }
  }

  return args;
}

function colName(col: string): Expression<unknown> {
  return new ExpressionWrapper(ValueNode.createImmediate(col));
}

function colRef(table: string, col: string): Expression<unknown> {
  return new ExpressionWrapper(
    ReferenceNode.create(ColumnNode.create(col), TableNode.create(table)),
  );
}
