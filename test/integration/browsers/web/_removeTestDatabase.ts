import type { Name } from "@evolu/common";

/** Removes a test database once its DbWorker has closed its OPFS handles. */
export const removeTestDatabase = async (name: Name): Promise<void> => {
  // SharedWorker shutdown does not await the DbWorker. Its database lock is
  // released only after SQLite has closed the pool's access handles.
  await navigator.locks.request(`evolu-leaderlock-${name}`, async () => {
    const root = await navigator.storage.getDirectory();
    try {
      await root.removeEntry(`.${name}`, { recursive: true });
    } catch (error) {
      // A canceled startup may create no directory, and several simulated tabs
      // can register cleanup for the same database.
      if (!(error instanceof DOMException && error.name === "NotFoundError"))
        throw error;
    }
  });
};
