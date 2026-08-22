import * as Evolu from "@evolu/common";
import { evoluSvelteDeps } from "@evolu/svelte";
import { createRun } from "@evolu/web";

const TodoId = Evolu.id("Todo");
export type TodoId = typeof TodoId.Output;

const Schema = {
  todo: {
    id: TodoId,
    title: Evolu.NonEmptyTrimmedString100,
    isCompleted: Evolu.nullOr(Evolu.SqliteBoolean),
  },
};

const createQuery = Evolu.createQueryBuilder(Schema);

export const todosQuery = /*#__PURE__*/ createQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted"])
    .where("isDeleted", "is not", Evolu.sqliteTrue)
    .where("title", "is not", null)
    .$narrowType<{ title: Evolu.KyselyNotNull }>()
    .orderBy("createdAt"),
);

const run = createRun(evoluSvelteDeps);

run.deps.evoluError.subscribe(() => {
  const error = run.deps.evoluError.get();
  if (!error) return;

  alert("🚨 Evolu error occurred! Check the console.");
});

// oxlint-disable evolu/require-pure-annotation -- Creates the application singleton and its owned runtime resources.
export const evolu = await run.ok(
  Evolu.createEvolu(Schema, {
    appName: Evolu.AppName.orThrow("minimal-example"),
    appOwner: Evolu.testAppOwner,

    ...(import.meta.env.DEV && {
      transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
    }),
  }),
);
// oxlint-enable evolu/require-pure-annotation
