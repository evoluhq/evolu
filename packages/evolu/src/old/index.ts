export * from "./exports.js";

import "@effect/schema/Schema";
import { createEvoluCreate } from "./exports.js";

/**
 * `Evolu.create` ensures database schema, and returns typed React Hooks.
 * Evolu uses [Schema](https://github.com/effect-ts/schema) for domain modeling.
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
 * const TodoTable = Schema.struct({
 *   id: TodoId,
 *   title: Evolu.NonEmptyString1000,
 *   isCompleted: Evolu.SqliteBoolean,
 * });
 * type TodoTable = Schema.To<typeof TodoTable>;
 *
 * const Database = Schema.struct({
 *   todo: TodoTable,
 * });
 *
 * export const {
 *   useQuery,
 *   useMutation,
 *   useEvoluError,
 *   useOwner,
 *   useOwnerActions,
 * } = Evolu.create(Database);
 * ```
 *
 * There is one simple rule for local-first apps domain modeling:
 * After the initial release, models shall be append-only.
 *
 * Tables and columns shall not be removed because there is a possibility
 * that somebody is already using them. Column types shall be enriched only.
 *
 * With this simple rule, any app version can handle any schema version.
 * Evolu database is schemaless and doesn't have to be migrated when
 * a schema is changed. Migrations are not feasible for local-first apps.
 *
 * If an obsolete app gets a sync message with a newer schema, Evolu
 * automatically updates the database schema to store the message safely,
 * and `useQuery` filterMap helper will ignore unknown rows until
 * the app is updated.
 *
 * To learn more about migration-less schema evolving, check the `useQuery`
 * documentation.
 */
export const create = createEvoluCreate();
