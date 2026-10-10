import { assertSame, createQueryBuilder, testEvoluSchema } from "@evolu/common";
import type { Evolu, QueryRows } from "@evolu/common/local-first";
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { after, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { compileModule } from "svelte/compiler";

// Runes work only in compiled modules, so .svelte.ts modules are compiled as
// they load. The Svelte compiler parses JavaScript, so types are stripped first.
const svelteHooks = registerHooks({
  load: (url, context, nextLoad) => {
    if (!url.endsWith(".svelte.ts")) return nextLoad(url, context);
    const filename = fileURLToPath(url);
    const { js } = compileModule(
      stripTypeScriptTypes(readFileSync(filename, "utf8")),
      { filename, generate: "client" },
    );
    return { format: "module", shortCircuit: true, source: js.code };
  },
});

// The module creates web dependencies on import, which need browser APIs.
mock.module("@evolu/web", {
  // @ts-expect-error -- Node.js 24.20 replaces the deprecated namedExports option with exports, which @types/node 24.13 does not declare yet.
  exports: { createEvoluDeps: () => ({}) },
});

after(() => {
  svelteHooks.deregister();
});

const { queryState } = await import("./index.svelte.ts");
// queryState's `$effect` needs a parent effect, as in a component. This is
// what `$effect.root` compiles to.
const { effect_root: effectRoot } = (await import(
  // @ts-expect-error -- Svelte's internal client runtime has no type declarations.
  "svelte/internal/client"
)) as { readonly effect_root: (fn: () => void) => () => void };

const createQuery = createQueryBuilder(testEvoluSchema);
const allTodos = createQuery((db) =>
  db.selectFrom("todo").select(["id", "title"]),
);
const rows = [{ id: "todo", title: "Buy milk" }] as unknown as QueryRows<
  typeof allTodos.Row
>;
// Only loadQuery, subscribeQuery, and getQueryRows are used by queryState.
const evolu = {
  loadQuery: () => Promise.resolve(rows),
  subscribeQuery: () => () => () => undefined,
  getQueryRows: () => rows,
} as unknown as Evolu<typeof testEvoluSchema>;

test("returns loaded rows", async () => {
  let state!: { readonly rows: QueryRows<typeof allTodos.Row> };
  const dispose = effectRoot(() => {
    state = queryState(evolu, () => allTodos);
  });
  await setImmediate();

  assertSame(state.rows, rows);
  dispose();
});
