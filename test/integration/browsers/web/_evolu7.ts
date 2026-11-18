/**
 * A tab of an app built with Evolu 7: the published `@evolu/common` 7.4.1,
 * whose DbWorker stores the database in OPFS with `@evolu/sqlite-wasm` 2.2.4.
 *
 * `@evolu/web` 2.4.0, which starts that worker, cannot be installed beside the
 * workspace, because its `@evolu/common` peer resolves to this repository's. So
 * the two things it does are written here as it has them: a tab runs the worker
 * while it holds the lock `evolu-sharedwebworker-<name>`, and the worker opens
 * the pool `<name>` with `evolu1.db`.
 *
 * @module
 */
import * as evolu7 from "@evolu/common-7.4.1";
import type {
  CreateDbWorker,
  DbWorkerInput,
  DbWorkerOutput,
} from "@evolu/common-7.4.1/local-first";

/** The tests' `todo` table as an Evolu 7 schema. */
const Evolu7Schema = {
  todo: {
    id: evolu7.id("Todo"),
    title: evolu7.NonEmptyString1000,
    isCompleted: evolu7.nullOr(evolu7.SqliteBoolean),
  },
};

/**
 * Starts Evolu 7 in this page as a tab of the app `name` does, with the owner
 * Evolu 7 generates. `settled` resolves once Evolu 7 has written every mutation
 * called so far, and `close` ends the tab's worker and then releases its lock,
 * the order in which browsers end a closed tab's.
 *
 * Evolu 7 keeps an instance per name while the page lives and cannot be
 * disposed, so every call needs a name of its own.
 */
export const setupEvolu7Tab = async (
  name: string,
): Promise<{
  readonly evolu: evolu7.Evolu<typeof Evolu7Schema>;
  readonly appOwner: evolu7.AppOwner;
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}> => {
  const closed = Promise.withResolvers<void>();
  let tab: Promise<void> | null = null;

  // As createSharedWebWorker of @evolu/web 2.4.0, for the tab that takes the
  // lock, which that tab holds until it closes.
  const createDbWorker: CreateDbWorker = (name) => {
    let worker: Worker | null = null;
    let onMessage: ((message: DbWorkerOutput) => void) | null = null;
    const pending: Array<DbWorkerInput> = [];
    tab = navigator.locks.request(`evolu-sharedwebworker-${name}`, async () => {
      worker = new Worker(
        new URL("./workers/evolu7-db-worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.addEventListener(
        "message",
        (event: MessageEvent<DbWorkerOutput>) => {
          onMessage?.(event.data);
        },
      );
      for (const message of pending) worker.postMessage(message);
      await closed.promise;
      worker.terminate();
    });
    return {
      postMessage: (message) => {
        if (worker) worker.postMessage(message);
        else pending.push(message);
      },
      onMessage: (callback) => {
        onMessage = callback;
      },
    };
  };

  const evolu = evolu7.createEvolu({
    console: evolu7.createConsole(),
    createDbWorker,
    randomBytes: evolu7.createRandomBytes(),
    reloadApp: () => undefined,
    time: evolu7.createTime(),
  })(Evolu7Schema, {
    name: evolu7.SimpleName.orThrow(name),
    // Local-only, as the tests migrate what is stored, not what a relay has.
    transports: [],
  });

  const appOwner = await evolu.appOwner;
  let settledCount = 0;

  return {
    evolu,
    appOwner,
    settled: async () => {
      // The DbWorker answers in order, so the query runs after the mutations.
      // Evolu 7 keeps a loaded query's promise, so each wait loads a query of
      // its own.
      settledCount++;
      await evolu.loadQuery(
        evolu.createQuery((db) =>
          db.selectFrom("todo").select("id").limit(settledCount),
        ),
      );
    },
    close: async () => {
      closed.resolve();
      await tab;
    },
  };
};
