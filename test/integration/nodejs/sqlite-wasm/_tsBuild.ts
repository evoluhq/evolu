/**
 * Loads `@evolu/sqlite-wasm` 3.54.0-build2, the last build whose pool encrypts
 * in TypeScript, for the Node.js tests that check the C build against it.
 *
 * Every test file that imports this module compiles the build's wasm once. Each
 * test then opens the build's pool on a fake OPFS, often one a pool of the C
 * build used before, with {@link setupTsBuildPool}.
 *
 * @module
 */

import {
  getOrThrow,
  testCreateDeps,
  testCreateRun,
  type TestRunDefaultDeps,
} from "@evolu/common";
import {
  createSqliteWasm,
  OpfsName,
  openSahPool,
  sqliteWasmUrl,
  type SahPool,
  type SqliteWasm,
} from "@evolu/sqlite-wasm-3.54.0-build2";
import { readFileSync } from "node:fs";
import type { FakeOpfs } from "./_fakeOpfs.ts";

const tsBuildModule = await WebAssembly.compile(readFileSync(sqliteWasmUrl));

/** A pool of 3.54.0-build2 on a fake OPFS, on a fresh instance of its wasm. */
export interface TsBuildPool extends TestRunDefaultDeps {
  readonly sqliteWasm: SqliteWasm;
  readonly pool: SahPool;
}

/**
 * Opens a pool of 3.54.0-build2 in the `.evolu` directory of a fake OPFS, the C
 * build's default in `setupSahPool`, on a fresh instance with fresh or the
 * given dependencies. One pool holds a directory's files at a time, so the C
 * build's pool of the directory is disposed first.
 */
export const setupTsBuildPool = async ({
  fake,
  deps = testCreateDeps(),
}: {
  fake: FakeOpfs;
  deps?: TestRunDefaultDeps;
}): Promise<TsBuildPool> => {
  await using run = testCreateRun(deps);
  const sqliteWasm = getOrThrow(await run(createSqliteWasm(tsBuildModule)));
  await using poolRun = testCreateRun({
    ...deps,
    opfsRoot: fake.opfsRoot,
    sqliteWasm,
  });
  const pool = getOrThrow(
    await poolRun(openSahPool({ directory: [OpfsName.orThrow(".evolu")] })),
  );
  return { ...deps, sqliteWasm, pool };
};
