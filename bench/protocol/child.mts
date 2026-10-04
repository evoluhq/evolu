/**
 * Child processes of the protocol benchmarks.
 *
 * Each source root runs in its own child process, because Evolu sentinels,
 * polyfills, and peak RSS are per process. A child registers
 * {@link guardSourceRoot} before it loads Evolu with {@link loadModules}, and
 * sends its result with {@link sendToParent}. The parent starts it with
 * {@link spawnChild}. This module statically imports only Node.js modules and
 * erased types, so a child can import it before choosing a root.
 */
import { spawn } from "node:child_process";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CreateSqliteDriver, TimingSafeEqual } from "@evolu/common";

export type CommonModule = typeof import("@evolu/common");
export type LocalFirstModule = typeof import("@evolu/common/local-first");
type PolyfillsModule = typeof import("@evolu/common/polyfills");
type NodeSqliteModule = typeof import("../../packages/nodejs/src/Sqlite.ts");
type NodeCryptoModule = typeof import("../../packages/nodejs/src/Crypto.ts");

/** The Evolu modules of one source root. */
export interface Modules {
  readonly common: CommonModule;
  readonly localFirst: LocalFirstModule;
  readonly createBetterSqliteDriver: CreateSqliteDriver;
  readonly timingSafeEqual: TimingSafeEqual;
  /** Whether `applyProtocolMessageAsClient` takes `onChangeTooLarge`. */
  readonly supportsOnChangeTooLarge: boolean;
}

/** Exports a benchmark needs, checked when the modules load. */
export interface RequiredExports {
  readonly common: ReadonlyArray<keyof CommonModule>;
  readonly localFirst: ReadonlyArray<keyof LocalFirstModule>;
}

/**
 * Fails when this process loads an Evolu source from outside `root`, such as
 * the working tree's `@evolu/common` from a snapshot's `@evolu/nodejs`.
 */
export const guardSourceRoot = (root: string, benchmarkName: string): void => {
  const ownSources = `${pathToFileURL(join(root, "packages")).href}/`;
  const evoluSource = /\/packages\/[^/]+\/src\//u;
  registerHooks({
    load: (url, context, nextLoad) => {
      if (
        evoluSource.test(url) &&
        !url.includes("/node_modules/") &&
        !url.startsWith(ownSources)
      ) {
        throw new Error(
          `The ${benchmarkName} benchmark for ${root} loaded ${url} from another source root.`,
        );
      }
      return nextLoad(url, context);
    },
  });
};

/** Loads Evolu from `root`, installs its polyfills, and checks `required`. */
export const loadModules = async (
  root: string,
  required: RequiredExports,
): Promise<Modules> => {
  // A computed specifier types the module as any, so each call names its type.
  const importFromRoot = async <M,>(path: string): Promise<M> =>
    (await import(pathToFileURL(join(root, path)).href)) as M;

  const polyfills = await importFromRoot<PolyfillsModule>(
    "packages/common/src/Polyfills.ts",
  );
  polyfills.installPolyfills();
  const common = await importFromRoot<CommonModule>(
    "packages/common/src/index.ts",
  );
  const localFirst = await importFromRoot<LocalFirstModule>(
    "packages/common/src/local-first/index.ts",
  );
  const nodeSqlite = await importFromRoot<NodeSqliteModule>(
    "packages/nodejs/src/Sqlite.ts",
  );
  const nodeCrypto = await importFromRoot<NodeCryptoModule>(
    "packages/nodejs/src/Crypto.ts",
  );

  const missing = [
    ...required.common.filter((name) => !(name in common)),
    ...required.localFirst.filter((name) => !(name in localFirst)),
    ...(["createBetterSqliteDriver"] as const).filter(
      (name) => !(name in nodeSqlite),
    ),
    ...(["createTimingSafeEqual"] as const).filter(
      (name) => !(name in nodeCrypto),
    ),
  ];
  if (missing.length > 0) {
    throw new Error(`${root} lacks ${missing.join(", ")}.`);
  }

  return {
    common,
    localFirst,
    createBetterSqliteDriver: nodeSqlite.createBetterSqliteDriver,
    timingSafeEqual: nodeCrypto.createTimingSafeEqual(),
    // No export tells whether the option exists, but the client reads it in
    // its own source text. Older versions neither read it nor skip changes.
    supportsOnChangeTooLarge: localFirst.applyProtocolMessageAsClient
      .toString()
      .includes("onChangeTooLarge"),
  };
};

/**
 * Sends a child's result over the IPC channel, or prints it as JSON without
 * one.
 */
export const sendToParent = async (result: unknown): Promise<void> => {
  if (process.send === undefined) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const send = process.send.bind(process);
  await new Promise<void>((resolve, reject) => {
    send(result, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  process.disconnect();
};

export interface SpawnChildOptions {
  readonly script: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  /** Names the child in errors, such as `Protocol benchmark child for <root>`. */
  readonly label: string;
  readonly execArgv?: ReadonlyArray<string>;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Runs `script` in a child process with inherited stdout and stderr and
 * resolves with the message it sends.
 */
export const spawnChild = ({
  script,
  args,
  cwd,
  label,
  execArgv = [],
  env,
}: SpawnChildOptions): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...execArgv, script, ...args], {
      cwd,
      env,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    let message: unknown;
    child.on("message", (value) => {
      message = value;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code !== 0 || message === undefined) {
        reject(
          new Error(
            `The ${label} exited with ${signal ?? `code ${code}`} without a result.`,
          ),
        );
        return;
      }
      resolve(message);
    });
  });
