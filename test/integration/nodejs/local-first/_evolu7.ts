/**
 * The published Evolu 7.4.1, run in-process over a SQLite driver of Evolu 8, so
 * tests migrate a database that Evolu 7's own code wrote. It is the test-only
 * dependency `@evolu/common-7.4.1`.
 *
 * @module
 */
import * as evolu7 from "@evolu/common-7.4.1";
import { createDbWorkerForPlatform } from "@evolu/common-7.4.1/local-first";
// By the package's name, so each test project gets its own type of it.
import type { SqliteDriver } from "@evolu/common";

/**
 * The tests' `todo` table as an Evolu 7 schema, with a table the tests' schema
 * lacks and a local-only table.
 */
const Evolu7Schema = {
  todo: {
    id: evolu7.id("Todo"),
    title: evolu7.NonEmptyString1000,
    isCompleted: evolu7.nullOr(evolu7.SqliteBoolean),
  },
  legacy: {
    id: evolu7.id("Legacy"),
    name: evolu7.NonEmptyString1000,
  },
  _note: {
    id: evolu7.id("Note"),
    text: evolu7.NonEmptyString1000,
  },
};

/** When the Evolu 7 of {@link setupEvolu7} starts: 2026-01-01. */
export const evolu7StartAt = 1_767_225_600_000;

/**
 * Starts Evolu 7 on `driver`, the database `name`, which it creates with the
 * owner Evolu 7 generates, or with the owner of `mnemonic`, which the app gives
 * it as `externalAppOwner`. It syncs with the relay at `relayUrl`, or with
 * none. Its clock starts at {@link evolu7StartAt} and advances a millisecond at
 * each reading, so its changes have times of their own. `settled` resolves once
 * Evolu 7 has written every mutation called so far, `errors` are the errors it
 * reported, and `closeSockets` closes its sockets, which it would otherwise
 * reconnect for good.
 *
 * Evolu 7 keeps an instance per name while the process lives and cannot be
 * disposed, so every call needs a name of its own.
 */
export const setupEvolu7 = async (
  driver: SqliteDriver,
  {
    name,
    mnemonic,
    relayUrl,
  }: { name: string; mnemonic?: string; relayUrl?: string },
): Promise<{
  readonly evolu: evolu7.Evolu<typeof Evolu7Schema>;
  readonly appOwner: evolu7.AppOwner;
  readonly settled: () => Promise<void>;
  readonly errors: ReadonlyArray<evolu7.EvoluError>;
  readonly closeSockets: () => void;
}> => {
  const console = evolu7.createConsole();
  let now = evolu7StartAt;
  const time: evolu7.Time = {
    now: () => now++,
    nowIso: () => new Date(now++).toISOString() as evolu7.DateIso,
  };
  const randomBytes = evolu7.createRandomBytes();
  const sockets: Array<evolu7.WebSocket> = [];

  const createSqliteDriver: evolu7.CreateSqliteDriver = () =>
    Promise.resolve({
      exec: (query) => {
        // Evolu 7's query has the SQL and the parameters of Evolu 8's.
        const { rows, changes } = driver.exec(
          query as unknown as Parameters<SqliteDriver["exec"]>[0],
        );
        return { rows: rows as Array<evolu7.SqliteRow>, changes };
      },
      export: () => driver.export(),
      // The test owns the driver.
      [Symbol.dispose]: () => undefined,
    });

  const evolu = evolu7.createEvolu({
    console,
    createDbWorker: () =>
      createDbWorkerForPlatform({
        console,
        createSqliteDriver,
        createWebSocket: (url, options) => {
          const socket = evolu7.createWebSocket(url, options);
          sockets.push(socket);
          return socket;
        },
        random: evolu7.createRandom(),
        randomBytes,
        time,
      }),
    randomBytes,
    reloadApp: () => undefined,
    time,
  })(Evolu7Schema, {
    name: evolu7.SimpleName.orThrow(name),
    transports: relayUrl == null ? [] : [{ type: "WebSocket", url: relayUrl }],
    ...(mnemonic != null && {
      externalAppOwner: evolu7.createAppOwner(
        evolu7.mnemonicToOwnerSecret(evolu7.Mnemonic.orThrow(mnemonic)),
      ),
    }),
  });

  const errors: Array<evolu7.EvoluError> = [];
  evolu.subscribeError(() => {
    const error = evolu.getError();
    if (error) errors.push(error);
  });

  const appOwner = await evolu.appOwner;
  let settledCount = 0;

  return {
    evolu,
    appOwner,
    errors,
    closeSockets: () => {
      for (const socket of sockets) socket[Symbol.dispose]();
    },
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
  };
};
