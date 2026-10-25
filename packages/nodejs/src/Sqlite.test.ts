import {
  assertEqual,
  Name,
  testCreateRun,
  type NativeSqlite,
  type NativeSqliteDatabase,
} from "@evolu/common";
import { mock, test } from "node:test";

let loads = 0;

const database: NativeSqliteDatabase = {
  prepare: () => {
    throw new Error("Not prepared in this test.");
  },
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
    loadNativeSqlite: () => {
      loads++;
      return binding;
    },
  },
});

const { createNodeJsSqliteDriver } = await import("./Sqlite.ts");

test("the driver loads Evolu's SQLite at its first open, and only then", async () => {
  assertEqual(loads, 0);
  const run = testCreateRun();

  for (let opens = 0; opens < 3; opens++) {
    using _driver = await run.ok(
      createNodeJsSqliteDriver(Name.orThrow("Test"), { mode: "memory" }),
    );
  }

  assertEqual(loads, 1);
});
