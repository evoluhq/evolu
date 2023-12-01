import { Context, Effect, Layer } from "effect";
import { Kysely } from "kysely";
import { Database } from "./Database.js";

export interface EvoluServer {
  readonly createDatabase: Effect.Effect<never, never, void>;

  readonly sync: (
    body: Uint8Array,
  ) => Effect.Effect<never, BadRequestError, Buffer>;
}
export const EvoluServer = Context.Tag<EvoluServer>();

export class BadRequestError {
  readonly _tag = "BadRequestError";
  constructor(readonly error: unknown) {}
}

export const EvoluServerLive = Layer.effect(
  EvoluServer,
  Effect.gen(function* (_) {
    const db = yield* _(EvoluServerKysely);

    return EvoluServer.of({
      createDatabase: Effect.promise(async () => {
        await db.schema
          .createTable("message")
          .ifNotExists()
          .addColumn("timestamp", "text")
          .addColumn("userId", "text")
          .addColumn("content", "blob")
          .addPrimaryKeyConstraint("messagePrimaryKey", ["timestamp", "userId"])
          .execute();
        await db.schema
          .createTable("merkleTree")
          .ifNotExists()
          .addColumn("userId", "text", (col) => col.primaryKey())
          .addColumn("merkleTree", "text")
          .execute();
      }),

      sync: (_body) =>
        Effect.gen(function* (_) {
          yield* _(Effect.succeed(1));
          throw "";
        }),
    });
  }),
);

export type EvoluServerKysely = Kysely<Database>;
export const EvoluServerKysely = Context.Tag<EvoluServerKysely>();
