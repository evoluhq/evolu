export { createEvolu } from "@evolu/common-web";

export { parseMnemonic } from "@evolu/common-web";
export * from "@evolu/common/public";

export * from "./EvoluContext.js";
export * from "./useEvolu.js";
export * from "./useEvoluError.js";
export * from "./useOwner.js";
export * from "./useQuerySubscription.js";
export * from "./useQuery.js";
export * from "./useSyncExternalStore.js";
export * from "./useSyncState.js";

/**
 * Create Evolu for Solid.
 *
 * Tables with a name prefixed with `_` are local-only, which means they are
 * never synced. It's useful for device-specific or temporal data.
 *
 * @example
 *   import * as S from "@effect/schema/Schema";
 *   import { NonEmptyString1000, createEvolu, id } from "@evolu/react";
 *
 *   const TodoId = id("Todo");
 *   type TodoId = S.Schema.Type<typeof TodoId>;
 *
 *   const TodoTable = table({
 *     id: TodoId,
 *     title: NonEmptyString1000,
 *   });
 *   type TodoTable = S.Schema.Type<typeof TodoTable>;
 *
 *   const Database = database({
 *     // _todo is local-only table
 *     _todo: TodoTable,
 *     todo: TodoTable,
 *   });
 *   type Database = S.Schema.Type<typeof Database>;
 *
 *   const evolu = createEvolu(Database);
 */
