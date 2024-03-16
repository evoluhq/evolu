import { FlushSync, makeCreateEvolu } from "@evolu/common";
import { EvoluWebLive } from "@evolu/common-web";
import * as Layer from "effect/Layer";
import { flushSync } from "react-dom";

export { parseMnemonic } from "@evolu/common-web";
export * from "@evolu/common/public";

const FlushSyncLive = Layer.succeed(FlushSync, flushSync);

/**
 * Create Evolu for React.
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
export const createEvolu = makeCreateEvolu(
  EvoluWebLive.pipe(Layer.provide(FlushSyncLive)),
);

export * from "@evolu/common-react";
