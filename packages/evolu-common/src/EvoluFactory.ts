import * as S from "@effect/schema/Schema";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Config, createEvoluRuntime } from "./Config.js";
import { DatabaseSchema } from "./Db.js";
import { Evolu, createEvolu } from "./Evolu.js";

export class EvoluFactory extends Context.Tag("EvoluFactory")<
  EvoluFactory,
  {
    /**
     * Create Evolu from the database schema.
     *
     * Tables with a name prefixed with `_` are local-only, which means they are
     * never synced. It's useful for device-specific or temporal data.
     *
     * @example
     *   import * as S from "@effect/schema/Schema";
     *   import * as E from "@evolu/react";
     *   // The same API for different platforms
     *   // import * as E from "@evolu/react-native";
     *   // import * as E from "@evolu/common-web";
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
    readonly createEvolu: <T extends DatabaseSchema, I>(
      schema: S.Schema<T, I>,
      config?: Partial<Config>,
    ) => Evolu<T>;
  }
>() {}

export const EvoluFactoryCommon = Layer.effect(
  EvoluFactory,
  Effect.gen(function* (_) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const foo = yield* _(Effect.succeed(1));

    // const dbWorker = yield* _(DbWorker);

    // For hot/live reload and future Evolu dynamic import.
    const instances = new Map<string, Evolu>();

    return {
      createEvolu: <T extends DatabaseSchema, I>(
        schema: S.Schema<T, I>,
        config?: Partial<Config>,
      ): Evolu<T> => {
        const runtime = createEvoluRuntime(config);
        const { name } = Config.pipe(runtime.runSync);
        let evolu = instances.get(name);
        if (evolu == null) evolu = createEvolu(schema).pipe(runtime.runSync);
        evolu.ensureSchema(schema);
        return evolu as Evolu<T>;
      },
    };
  }),
);
