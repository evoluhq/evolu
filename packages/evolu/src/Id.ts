import * as S from "@effect/schema/Schema";
import { Brand } from "effect";

/**
 * Branded Id Schema for any table Id.
 * To create Id Schema for a specific table, use {@link id}.
 */
export const Id = S.string.pipe(S.pattern(/^[\w-]{21}$/), S.brand("Id"));
export type Id = S.To<typeof Id>;

/**
 * A factory function to create {@link Id} Schema for a specific table.
 *
 * ### Example
 *
 * ```
 * import * as Schema from "@effect/schema/Schema";
 * import * as Evolu from "evolu";
 *
 * const TodoId = Evolu.id("Todo");
 * type TodoId = Schema.To<typeof TodoId>;
 *
 * if (!Schema.is(TodoId)(value)) return;
 * ```
 */
export const id = <T extends string>(
  table: T
): S.BrandSchema<string, string & Brand.Brand<"Id"> & Brand.Brand<T>> =>
  Id.pipe(S.brand(table));
