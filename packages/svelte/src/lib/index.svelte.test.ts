import {
  assert,
  assertSame,
  createQueryBuilder,
  emptyArray,
  testEvoluSchema,
} from "@evolu/common";
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
  exports: { createEvoluDeps: () => ({}) },
});

after(() => {
  svelteHooks.deregister();
});

const { queryState } = await import("./index.svelte.ts");
// Runes compile to these. queryState's `$effect` needs a parent effect, as in
// a component, which `$effect.root` creates, and `$state` makes a query
// reactive.
const {
  effect_root: effectRoot,
  get,
  set,
  state,
} = (await import(
  // @ts-expect-error -- Svelte's internal client runtime has no type declarations.
  "svelte/internal/client"
)) as {
  readonly effect_root: (fn: () => void) => () => void;
  readonly state: <T>(value: T) => Signal<T>;
  readonly get: <T>(signal: Signal<T>) => T;
  readonly set: <T>(signal: Signal<T>, value: T) => void;
};

/** The part of Svelte's internal signal that types its value. */
interface Signal<T> {
  readonly v: T;
}

const createQuery = createQueryBuilder(testEvoluSchema);
const allTodos = createQuery((db) =>
  db.selectFrom("todo").select(["id", "title"]),
);
const firstTodo = createQuery((db) =>
  db.selectFrom("todo").select(["id", "title"]).limit(1),
);
type TodoQuery = typeof allTodos;
type TodoRows = QueryRows<TodoQuery["Row"]>;

const allTodosRows = [
  { id: "todo", title: "Buy milk" },
  { id: "other", title: "Walk the dog" },
] as unknown as TodoRows;
const firstTodoRows = [
  { id: "todo", title: "Buy milk" },
] as unknown as TodoRows;

/**
 * Stubs the query API of Evolu, which caches one load per query. Resolving a
 * load stores its rows and notifies subscribers before awaiters of the load
 * run.
 */
const setupEvolu = () => {
  const loadsByQuery = new Map<
    TodoQuery,
    {
      readonly promise: Promise<TodoRows>;
      readonly resolve: (rows: TodoRows) => void;
    }
  >();
  const rowsByQuery = new Map<TodoQuery, TodoRows>();
  const listenersByQuery = new Map<TodoQuery, Set<() => void>>();

  // Only loadQuery, subscribeQuery, and getQueryRows are used by queryState.
  const evolu = {
    loadQuery: (query: TodoQuery) => {
      let load = loadsByQuery.get(query);
      if (!load) {
        // The package targets ES2017, which has no Promise.withResolvers.
        let resolve!: (rows: TodoRows) => void;
        const promise = new Promise<TodoRows>((resolvePromise) => {
          resolve = resolvePromise;
        });
        load = { promise, resolve };
        loadsByQuery.set(query, load);
      }
      return load.promise;
    },
    subscribeQuery: (query: TodoQuery) => (listener: () => void) => {
      const listeners = listenersByQuery.get(query) ?? new Set();
      listenersByQuery.set(query, listeners.add(listener));
      return () => {
        listeners.delete(listener);
      };
    },
    getQueryRows: (query: TodoQuery) => rowsByQuery.get(query) ?? emptyArray,
  } as unknown as Evolu<typeof testEvoluSchema>;

  const resolveLoad = (query: TodoQuery, rows: TodoRows): void => {
    const load = loadsByQuery.get(query);
    // Evolu reads only queries that loadQuery requested.
    assert(load, "The query was not loaded.");
    load.resolve(rows);
    rowsByQuery.set(query, rows);
    for (const listener of listenersByQuery.get(query) ?? []) listener();
  };

  return { evolu, resolveLoad };
};

/** Runs queryState over a reactive query, as a component would, and loads it. */
const setupQueryState = async () => {
  const { evolu, resolveLoad } = setupEvolu();
  const query = state<TodoQuery | undefined>(allTodos);
  let todos!: { readonly rows: TodoRows };
  const dispose = effectRoot(() => {
    todos = queryState(evolu, () => get(query));
  });
  await setImmediate();
  resolveLoad(allTodos, allTodosRows);
  await setImmediate();

  return { query, resolveLoad, todos, dispose };
};

test("returns loaded rows", async () => {
  const { todos, dispose } = await setupQueryState();

  assertSame(todos.rows, allTodosRows);
  dispose();
});

test("has no rows while a new query loads", async () => {
  const { query, todos, dispose } = await setupQueryState();
  set(query, firstTodo);
  await setImmediate();

  assertSame(todos.rows, emptyArray);
  dispose();
});

test("keeps rows of the current query when a previous query loads", async () => {
  const { query, resolveLoad, todos, dispose } = await setupQueryState();

  // Switching back before firstTodo loads reuses the resolved load of
  // allTodos, so the load of firstTodo resolves last.
  set(query, firstTodo);
  await setImmediate();
  set(query, allTodos);
  await setImmediate();
  resolveLoad(firstTodo, firstTodoRows);
  await setImmediate();

  assertSame(todos.rows, allTodosRows);
  dispose();
});

test("has no rows without a query", async () => {
  const { query, todos, dispose } = await setupQueryState();
  set(query, undefined);
  await setImmediate();

  assertSame(todos.rows, emptyArray);
  dispose();
});
