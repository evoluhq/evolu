/**
 * The loader in module workers of Chromium, Firefox and WebKit, which fetch the
 * binary from Vite as `application/wasm`.
 */

import { assertEqual } from "@evolu/common";
import { test } from "vitest";
import { setupSqliteWorker } from "./_harness.ts";

test("a worker loads the binary it fetches from Vite, and sqlite3_libversion returns 3.53.4", async () => {
  using worker = await setupSqliteWorker();

  assertEqual(await worker.run("libversion"), "3.53.4");
});
