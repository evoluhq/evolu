import { EvoluReactLive, makeCreateEvoluReact } from "@evolu/common-react";
import { EvoluWebLive } from "@evolu/common-web";
import { Layer } from "effect";

export { parseMnemonic } from "@evolu/common-web";
export * from "@evolu/common/public";

/**
 * Create Evolu for React.
 *
 * ### Example
 *
 * ```ts
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
 * const { useEvolu, useEvoluError, useQuery, useOwner } =
 *   Evolu.create(Database);
 * ```
 */
export const create = EvoluReactLive.pipe(
  Layer.provide(EvoluWebLive),
  makeCreateEvoluReact,
);
