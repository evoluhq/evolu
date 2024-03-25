import { EvoluFactory } from "@evolu/common";
import { EvoluFactoryWeb } from "@evolu/common-web";
import * as Effect from "effect/Effect";
// import * as Layer from "effect/Layer";
// import { flushSync } from "react-dom";

export { parseMnemonic } from "@evolu/common-web";
export * from "@evolu/common/public";

// const FlushSyncLive = Layer.succeed(FlushSync, flushSync);

const EvoluFactoryWebReact = EvoluFactoryWeb;

// JSDoc doesn't support destructured parameters, so we must copy-paste
// createEvolu docs from `evolu-common/src/Evolu.ts`.
// https://github.com/microsoft/TypeScript/issues/11859
export const {
  /**
   * Create Evolu from the database schema.
   *
   * Tables with a name prefixed with `_` are local-only, which means they are
   * never synced. It's useful for device-specific or temporal data.
   *
   * @example
   *   import * as S from "@effect/schema/Schema";
   *   import * as E from "@evolu/react";
   *
   *   const TodoId = E.id("Todo");
   *   type TodoId = S.Schema.Type<typeof TodoId>;
   *
   *   const TodoTable = E.table({
   *     id: TodoId,
   *     title: E.NonEmptyString1000,
   *   });
   *   type TodoTable = S.Schema.Type<typeof TodoTable>;
   *
   *   const Database = E.database({
   *     todo: TodoTable,
   *
   *     // Prefix `_` makes the table local-only (it will not sync)
   *     _todo: TodoTable,
   *   });
   *   type Database = S.Schema.Type<typeof Database>;
   *
   *   const evolu = E.createEvolu(Database);
   */
  createEvolu,
} = EvoluFactory.pipe(Effect.provide(EvoluFactoryWebReact), Effect.runSync);

export * from "@evolu/common-react";
