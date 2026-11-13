import {
  databaseHeldTimeout,
  durationToMillis,
  type Name,
} from "@evolu/common";

/** Removes a test database once its DbWorker has closed its OPFS handles. */
export const removeTestDatabase = async (name: Name): Promise<void> => {
  // The database lock keeps any DbWorker from opening the database meanwhile.
  // A DbWorker that ends gracefully releases it after SQLite closed the pool's
  // access handles, but disposing the deps terminates DbWorkers, and Chromium
  // and Firefox release a terminated worker's locks before they close its
  // access handles. Production waits for them by opening the pool with
  // databaseHeldTimeout; a page can't open access handles, so the removal is
  // retried for as long.
  await navigator.locks.request(`evolu-leaderlock-${name}`, async () => {
    const root = await navigator.storage.getDirectory();
    const deadline = performance.now() + durationToMillis(databaseHeldTimeout);
    for (;;) {
      try {
        await root.removeEntry(`.${name}`, { recursive: true });
        return;
      } catch (error) {
        if (!(error instanceof DOMException)) throw error;
        // A canceled startup may create no directory, and several simulated
        // tabs can register cleanup for the same database.
        if (error.name === "NotFoundError") return;
        if (
          error.name !== "NoModificationAllowedError" ||
          performance.now() > deadline
        )
          throw error;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 20);
        });
      }
    }
  });
};
