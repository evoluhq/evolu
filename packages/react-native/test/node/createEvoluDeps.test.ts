/**
 * `createEvoluDeps` end to end on the N-API mirror of the binding, with both
 * specs mocked, since Node.js can't load React Native: Evolu creates its
 * database in `EvoluApp`'s directory, and stores and queries rows.
 */
// Declares React Native's ErrorUtils global as src/Task.ts reads it, before
// React Native's own types, which the specs bring, declare it as a const.
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers -- Includes global declarations during type-checking without emitting a runtime import.
import type {} from "../../src/ErrorUtils.d.ts";

import {
  assertEqual,
  assertFalse,
  assertTrue,
  createRun,
  id,
  NonEmptyTrimmedString100,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  createQueryBuilder,
  testAppOwner,
} from "@evolu/common/local-first";
import { installPolyfills } from "@evolu/common/polyfills";
import { setupAddon } from "@evolu/sqlite-core/test/setup-addon.mts";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";

installPolyfills();

const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-deps-"));
after(() => {
  rmSync(directory, { recursive: true, force: true });
});
const binding = (await setupAddon()).createBinding();

mock.module(
  new URL("../../src/specs/NativeEvoluSqlite.ts", import.meta.url).href,
  { exports: { default: { createBinding: () => binding } } },
);
mock.module(
  new URL("../../src/specs/NativeEvoluApp.ts", import.meta.url).href,
  {
    exports: {
      default: {
        getDatabaseDirectory: () => directory,
        reloadApp: () => undefined,
      },
    },
  },
);

const { createEvoluDeps } = await import("../../src/createEvoluDeps.ts");

test("Evolu stores and queries rows in an encrypted database in EvoluApp's directory", async () => {
  const schema = {
    todo: { id: id("Todo"), title: NonEmptyTrimmedString100 },
  };
  const titlesQuery = createQueryBuilder(schema)((db) =>
    db.selectFrom("todo").select("title"),
  );
  using deps = createEvoluDeps();
  await using run = createRun(deps);
  await using evolu = await run.ok(
    createEvolu(schema, {
      appName: AppName.orThrow("deps"),
      appOwner: testAppOwner,
      transports: [],
    }),
  );

  const inserted = Promise.withResolvers<void>();
  evolu.insert(
    "todo",
    { title: NonEmptyTrimmedString100.orThrow("stored") },
    { onComplete: inserted.resolve },
  );
  await inserted.promise;

  assertEqual(await evolu.loadQuery(titlesQuery), [{ title: "stored" }]);
  const path = join(directory, `evolu1-${evolu.name}.db`);
  assertTrue(existsSync(path));
  // Evolu encrypts every database, so no SQLite header starts the file.
  assertFalse(
    readFileSync(path).toString("latin1", 0, 15) === "SQLite format 3",
  );
});
