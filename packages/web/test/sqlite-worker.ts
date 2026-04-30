import {
  createUnknownError,
  createRun,
  EncryptionKey,
  Name,
  type SafeSql,
  type SqliteDriver,
  type SqliteValue,
} from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import { createWasmSqliteDriver } from "../src/Sqlite.js";

installPolyfills();

// Typed reference to the Web Worker global scope.
const workerScope = globalThis as never as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
  close: () => void;
};

let driver: SqliteDriver | null = null;
let lockRelease = null as PromiseWithResolvers<void> | null;

const createDriver = async (cmd: {
  readonly name?: string;
  readonly encryptionKey?: Uint8Array;
}): Promise<void> => {
  if (!cmd.name) throw new Error("Name required");
  const name = Name.orThrow(cmd.name);
  const encryptionKey = cmd.encryptionKey
    ? EncryptionKey.orThrow(cmd.encryptionKey)
    : undefined;
  await using run = createRun();
  const result = await run(
    createWasmSqliteDriver(
      name,
      encryptionKey ? { mode: "encrypted", encryptionKey } : undefined,
    ),
  );
  if (!result.ok) throw new Error("Driver creation failed");
  driver = result.value;
};

workerScope.onmessage = (e: MessageEvent) => {
  void (async () => {
    const cmd = e.data as {
      readonly type:
        | "create"
        | "exec"
        | "export"
        | "dispose"
        | "deleteDatabase"
        | "disposeAndClose";
      readonly name?: string;
      readonly encryptionKey?: Uint8Array;
      readonly lockName?: string;
      readonly sql?: string;
      readonly parameters?: ReadonlyArray<SqliteValue>;
      readonly prepare?: boolean;
    };

    try {
      switch (cmd.type) {
        case "create": {
          if (cmd.lockName) {
            if (lockRelease) throw new Error("Lock already acquired");
            lockRelease = Promise.withResolvers<void>();
            void navigator.locks.request(cmd.lockName, async () => {
              try {
                await createDriver(cmd);
                workerScope.postMessage({ ok: true });
              } catch (err) {
                workerScope.postMessage({
                  ok: false,
                  error: createUnknownError(err),
                });
                lockRelease?.resolve();
                lockRelease = null;
              }
              await lockRelease?.promise;
            });
            break;
          }

          await createDriver(cmd);
          workerScope.postMessage({ ok: true });
          break;
        }
        case "exec": {
          if (!driver) throw new Error("Driver not created");
          if (!cmd.sql) throw new Error("SQL required");
          const query: {
            readonly sql: SafeSql;
            readonly parameters: Array<SqliteValue>;
            readonly options?: { readonly prepare: boolean };
          } = {
            sql: cmd.sql as SafeSql,
            parameters: [...(cmd.parameters ?? [])],
            ...(cmd.prepare ? { options: { prepare: true } } : {}),
          };
          const result = driver.exec(query);
          workerScope.postMessage({
            ok: true,
            data: { rows: [...result.rows], changes: result.changes },
          });
          break;
        }
        case "export": {
          if (!driver) throw new Error("Driver not created");
          const bytes = driver.export();
          workerScope.postMessage({
            ok: true,
            data: { length: bytes.length },
          });
          break;
        }
        case "dispose": {
          if (driver) {
            driver[Symbol.dispose]();
            driver = null;
          }
          lockRelease?.resolve();
          lockRelease = null;
          workerScope.postMessage({ ok: true });
          break;
        }
        case "deleteDatabase": {
          if (driver) {
            driver.deleteDatabase();
            driver = null;
          }
          lockRelease?.resolve();
          lockRelease = null;
          workerScope.postMessage({ ok: true });
          break;
        }
        case "disposeAndClose": {
          if (driver) {
            driver[Symbol.dispose]();
            driver = null;
          }
          lockRelease?.resolve();
          lockRelease = null;
          workerScope.postMessage({ ok: true });
          globalThis.setTimeout(() => workerScope.close(), 0);
          break;
        }
      }
    } catch (err) {
      workerScope.postMessage({
        ok: false,
        error: createUnknownError(err),
      });
    }
  })();
};
