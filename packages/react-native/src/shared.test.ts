import { constVoid, type EvoluDeps } from "@evolu/common";
import { describe, it } from "node:test";
import { createEvoluDeps } from "./shared.ts";

/** Resolves once the deps' worker has connected and published sync state. */
const waitForSyncState = (deps: EvoluDeps): Promise<void> =>
  new Promise((resolve) => {
    const unsubscribe = deps.syncState.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });

describe("createEvoluDeps", () => {
  it("connects deps created again to the running shared worker", async () => {
    const createDeps = () =>
      createEvoluDeps({
        reloadApp: constVoid,
        createSqliteDriver: () => {
          throw new Error("No database is opened.");
        },
      });

    const first = createDeps();
    await waitForSyncState(first);
    first[Symbol.dispose]();

    // A second in-process worker would wait for the build lock forever.
    using second = createDeps();
    await waitForSyncState(second);
  });
});
