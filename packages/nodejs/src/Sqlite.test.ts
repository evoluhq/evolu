import {
  assertEqual,
  assertSame,
  emptyPrototype,
  Name,
  testCreateRun,
  type NativeSqlite,
  type NativeSqliteDatabase,
} from "@evolu/common";
import { mock, test } from "node:test";

const loadOptions: Array<{ readonly rowPrototype: object }> = [];

const database: NativeSqliteDatabase = {
  prepare: () => {
    throw new Error("Not prepared in this test.");
  },
  run: () => 0,
  export: () => new ArrayBuffer(0),
  close: () => undefined,
};

const binding = {
  abiVersion: 1,
  openMemory: () => database,
} as unknown as NativeSqlite;

// Loading the addon reads the C library and creates a binding.
mock.module(new URL("./NativeSqlite.ts", import.meta.url).href, {
  exports: {
    loadNativeSqlite: (options: { readonly rowPrototype: object }) => {
      loadOptions.push(options);
      return binding;
    },
  },
});

const { createNodeJsSqliteDriver } = await import("./Sqlite.ts");

test("the driver loads Evolu's SQLite at its first open, and only then, with emptyPrototype for its rows", async () => {
  assertEqual(loadOptions.length, 0);
  const run = testCreateRun();

  for (let opens = 0; opens < 3; opens++) {
    using _driver = await run.ok(
      createNodeJsSqliteDriver(Name.orThrow("Test"), { mode: "memory" }),
    );
  }

  assertEqual(loadOptions.length, 1);
  // Without a prototype of its own, a column named __proto__ is a property,
  // and a blob in it isn't the row's prototype.
  assertSame(loadOptions[0]?.rowPrototype, emptyPrototype);
});
