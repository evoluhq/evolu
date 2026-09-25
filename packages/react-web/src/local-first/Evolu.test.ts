import { assertType } from "@evolu/common";
import type { createEvoluDeps as createWebEvoluDeps } from "@evolu/web";
import { test } from "node:test";
import type { createEvoluDeps } from "./Evolu.ts";

test("createEvoluDeps accepts the same options as the web one", () => {
  assertType<
    Parameters<typeof createEvoluDeps>,
    Parameters<typeof createWebEvoluDeps>
  >();
});
