import * as Effect from "@effect/io/Effect";
import * as Exit from "@effect/io/Exit";
import { Db } from "./Types.js";

export const transaction = <R, E, A>(
  effect: Effect.Effect<R, E, A>,
): Effect.Effect<Db | R, E, A> =>
  Effect.flatMap(Db, (db) =>
    Effect.acquireUseRelease(
      db.exec("begin"),
      () => effect,
      (_, exit) =>
        Exit.isFailure(exit) ? db.exec("rollback") : db.exec("commit"),
    ),
  );

export const deleteAllTables: Effect.Effect<Db, never, void> = Effect.gen(
  function* ($) {
    const db = yield* $(Db);
    yield* $(
      db.exec(`select name from sqlite_master where type='table'`),
      Effect.flatMap(
        // The dropped table is completely removed from the database schema and
        // the disk file. The table can not be recovered.
        // All indices and triggers associated with the table are also deleted.
        // https://sqlite.org/lang_droptable.html
        Effect.forEach(({ name }) => db.exec(`drop table ${name}`), {
          discard: true,
        }),
      ),
    );
  },
);
