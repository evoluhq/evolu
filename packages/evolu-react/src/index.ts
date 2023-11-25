import { EvoluCommonReactLive, makeCreate } from "@evolu/common-react";
import { EvoluCommonWebLive } from "@evolu/common-web";
import { Layer } from "effect";

export * from "@evolu/common/public";

/**
 * Create Evolu for React from database schema.
 *
 * @example
 * import * as S from "@effect/schema/Schema";
 * import * as Evolu from "@evolu/react";
 *
 * const TodoId = Evolu.id("Todo");
 * type TodoId = S.Schema.To<typeof TodoId>;
 *
 * const TodoTable = S.struct({
 *   id: TodoId,
 *   title: Evolu.NonEmptyString1000,
 * });
 * type TodoTable = S.Schema.To<typeof TodoTable>;
 *
 * const Database = S.struct({
 *   todo: TodoTable,
 * });
 *
 * export const {
 *   evolu,
 *   useEvoluError,
 *   createQuery,
 *   useQuery,
 *   useCreate,
 *   useUpdate,
 *   useOwner,
 *   useEvolu,
 * } = Evolu.create(Database);
 */
export const create = EvoluCommonReactLive.pipe(
  Layer.use(EvoluCommonWebLive),
  makeCreate,
);
