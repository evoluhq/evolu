import { test } from "vitest";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  onErrorCaptured,
  Suspense,
} from "vue";
import { emptyArray } from "../../../../packages/common/src/Array.ts";
import {
  assertEqual,
  assertSame,
} from "../../../../packages/common/src/Assert.ts";
import { createUnknownError } from "../../../../packages/common/src/Error.ts";
import { constVoid } from "../../../../packages/common/src/Function.ts";
import type { Evolu } from "../../../../packages/common/src/local-first/Evolu.ts";
import type { QueryRows } from "../../../../packages/common/src/local-first/Query.ts";
import {
  createQueryBuilder,
  testEvoluSchema,
} from "../../../../packages/common/src/local-first/Schema.ts";
import { EvoluContext } from "../../../../packages/vue/src/provideEvolu.ts";
import {
  useQuery,
  waitForRows,
} from "../../../../packages/vue/src/useQuery.ts";
import { testGlobalUnhandledRejections } from "../../shared/_vitest.ts";

const allTodos = createQueryBuilder(testEvoluSchema)((db) =>
  db.selectFrom("todo").select(["id"]),
);
type TodoRows = QueryRows<typeof allTodos.Row>;

/**
 * Mounts a component that loads the todos, and with `wait`, awaits their rows
 * in its async setup, under Suspense and a component that captures errors.
 */
const setupTodos = ({ wait }: { wait: boolean }) => {
  const load = Promise.withResolvers<TodoRows>();
  // Only loadQuery, subscribeQuery, and getQueryRows are used by useQuery.
  const evolu = {
    loadQuery: () => load.promise,
    subscribeQuery: () => () => constVoid,
    getQueryRows: () => emptyArray,
  } as unknown as Evolu;
  const captured: Array<unknown> = [];
  const Todos = defineComponent({
    setup: async () => {
      // oxlint-disable-next-line react/rules-of-hooks -- A Vue composable runs in setup.
      const todos = useQuery(allTodos);
      if (wait) await waitForRows(todos);
      return () => h("p", `todos ${todos.value.length}`);
    },
  });
  const container = document.createElement("div");
  const app = createApp({
    setup: () => {
      onErrorCaptured((error) => {
        captured.push(error);
        // Handled here, so Vue doesn't report it too.
        return false;
      });
      return () =>
        h(Suspense, null, {
          default: () => h(Todos),
          fallback: () => h("p", "loading"),
        });
    },
  });
  app.provide(EvoluContext, evolu);
  app.mount(container);

  return {
    load,
    captured,
    text: () => container.textContent,
    [Symbol.dispose]: () => {
      app.unmount();
    },
  };
};

/** Lets the load's handlers, Suspense, and Vue's render run. */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
};

test("Suspense shows its fallback until the awaited rows load", async () => {
  using setup = setupTodos({ wait: true });
  await flush();
  assertSame(setup.text(), "loading");

  setup.load.resolve([{ id: "todo" }] as unknown as TodoRows);
  await flush();
  assertSame(setup.text(), "todos 1");
});

test("a failed load the setup awaits reaches onErrorCaptured once and isn't reported as an unhandled rejection", async () => {
  using unhandledRejections = testGlobalUnhandledRejections();
  using setup = setupTodos({ wait: true });
  const error = createUnknownError("SQLite failed the query.");

  setup.load.reject(error);
  await flush();

  assertEqual(setup.captured, [error]);
  assertEqual(await unhandledRejections.settle(), []);
});

test("a failed load that nothing awaits is reported once as an unhandled rejection", async () => {
  using unhandledRejections = testGlobalUnhandledRejections();
  using setup = setupTodos({ wait: false });
  const error = createUnknownError("SQLite failed the query.");

  setup.load.reject(error);
  await flush();

  assertEqual(await unhandledRejections.settle(), [error]);
  assertEqual(setup.captured, []);
  assertSame(setup.text(), "todos 0");
});
