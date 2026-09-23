import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  expect,
  test as base,
  type BrowserContext,
  type Dialog,
  type Page,
  type TestInfo,
} from "playwright/test";
import { relayUrl } from "./playwright.config.mts";

export interface E2eOptions {
  readonly relayEntry: string;
}

/** Controls the real relay while preserving its database across restarts. */
export interface TestRelay {
  readonly url: string;
  /**
   * Starts a stopped relay, adding `relayEnv` to its environment. A running
   * relay is kept; passing `relayEnv` to it fails, because it would be
   * ignored.
   */
  readonly start: (
    relayEnv?: Readonly<Record<string, string>>,
  ) => Promise<void>;
  readonly stop: () => Promise<void>;
}

/**
 * Fails the test on uncaught browser errors and unexpected dialogs in every
 * watched context, and accepts the dialogs a test declares.
 */
export interface BrowserEvents {
  readonly watch: (context: BrowserContext) => void;
  /** Creates a watched context that closes when the test ends. */
  readonly newContext: () => Promise<BrowserContext>;
  /**
   * Accepts the next dialog after checking its message; a prompt receives
   * `value`. Any other dialog, including the examples' Evolu error alert, is
   * dismissed and fails the test.
   */
  readonly acceptNextDialog: (message: string, value?: string) => void;
}

export const test = /*#__PURE__*/ base.extend<
  E2eOptions & {
    browserEvents: BrowserEvents;
    relay: TestRelay;
    backupRelay: TestRelay;
  }
>({
  relayEntry: ["apps/relay/dist/src/index.js", { option: true }],

  relay: async ({ relayEntry }, runTest, testInfo) => {
    await setupRelay(relayUrl, relayEntry, runTest, testInfo);
  },

  backupRelay: async ({ relayEntry }, runTest, testInfo) => {
    const url = new URL(relayUrl);
    url.port = String(Number(url.port) + 1);
    await setupRelay(url.href, relayEntry, runTest, testInfo);
  },

  browserEvents: async ({ browser, relay: _relay }, runTest) => {
    const failures: Array<string> = [];
    const expectedDialogs: Array<{
      message: string;
      value: string | undefined;
    }> = [];
    const contexts: Array<BrowserContext> = [];

    const recordFailure = (error: unknown) => {
      failures.push(String(error));
    };

    const handleDialog = (dialog: Dialog) => {
      const expected = expectedDialogs[0];
      if (expected !== undefined && dialog.message() === expected.message) {
        expectedDialogs.shift();
        dialog.accept(expected.value).catch(recordFailure);
        return;
      }
      failures.push(`Unexpected ${dialog.type()} dialog: ${dialog.message()}`);
      dialog.dismiss().catch(recordFailure);
    };

    const watch = (context: BrowserContext) => {
      context.on("weberror", (error) => {
        failures.push(`Uncaught browser error: ${error.error().message}`);
      });
      context.on("page", (page) => {
        page.on("dialog", handleDialog);
      });
      for (const page of context.pages()) page.on("dialog", handleDialog);
    };

    await runTest({
      watch,
      newContext: async () => {
        const context = await browser.newContext();
        watch(context);
        contexts.push(context);
        return context;
      },
      acceptNextDialog: (message, value) => {
        expectedDialogs.push({ message, value });
      },
    });

    for (const context of contexts) await context.close();
    expect(failures, "Browser errors and unexpected dialogs").toEqual([]);
    expect(expectedDialogs, "Expected dialogs that did not appear").toEqual([]);
  },

  context: async ({ browserEvents, context }, runTest) => {
    browserEvents.watch(context);
    await runTest(context);
  },
});

const setupRelay = async (
  url: string,
  relayEntry: string,
  runTest: (relay: TestRelay) => Promise<void>,
  testInfo: TestInfo,
): Promise<void> => {
  const directory = await mkdtemp(join(tmpdir(), "evolu-e2e-relay-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        name.toUpperCase() !== "PORT" &&
        !name.toUpperCase().startsWith("EVOLU_RELAY_"),
    ),
  );
  const port = new URL(url).port;
  let relay: ReturnType<typeof spawn> | null = null;
  let closed = Promise.resolve();
  let output = "";
  let started = false;

  const start = async (
    relayEnv: Readonly<Record<string, string>> = {},
  ): Promise<void> => {
    if (relay !== null) {
      if (relay.exitCode === null && relay.signalCode === null) {
        expect(
          relayEnv,
          "Stop the running relay before starting it with relayEnv",
        ).toEqual({});
        return;
      }
      // Report a crashed relay instead of treating it as running.
      await stop();
    }
    const child = spawn(
      process.execPath,
      [resolve(import.meta.dirname, "../..", relayEntry)],
      {
        cwd: directory,
        env: { ...env, ...relayEnv, PORT: port },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    relay = child;
    closed = new Promise<void>((resolve) => {
      child.once("close", () => resolve());
    });
    started = false;
    let processOutput = "";
    let startupError: Error | undefined;
    child.once("error", (error) => {
      startupError = error;
    });
    const recordOutput = (data: string): void => {
      processOutput += data;
      output += data;
    };
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding("utf8").on("data", recordOutput);
    }

    // Wait for this process, rather than an unrelated server on the port.
    await expect
      .poll(
        () => {
          if (startupError) throw startupError;
          if (child.exitCode !== null) throw new Error(processOutput);
          return processOutput.includes(`Started on port ${port}`);
        },
        { message: "Relay startup", timeout: 10_000 },
      )
      .toBe(true);
    started = true;
  };

  const stop = async (): Promise<void> => {
    const child = relay;
    if (child === null) return;
    relay = null;
    const exitedDuringTest =
      child.exitCode !== null || child.signalCode !== null;
    child.kill();
    const forceKill = setTimeout(() => {
      child.kill("SIGKILL");
    }, 5_000);
    try {
      await closed;
    } finally {
      clearTimeout(forceKill);
    }
    if (started) {
      // A relay defect sets a non-zero exit status without exiting.
      expect(exitedDuringTest, `Relay exited during the test:\n${output}`).toBe(
        false,
      );
      expect(child.exitCode, `Relay shutdown status:\n${output}`).toBe(0);
    }
  };

  try {
    await start();
    await runTest({ url: new URL(url).href, start, stop });
  } finally {
    try {
      await stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
      await testInfo.attach(`relay-${port}.log`, {
        body: output,
        contentType: "text/plain",
      });
    }
  }
};

/**
 * Adds a todo with Enter. The examples clear the input in the mutation's
 * onComplete callback.
 */
export const addTodo = async (page: Page, title: string): Promise<void> => {
  const input = page.getByPlaceholder("Add a new todo...");
  await input.fill(title);
  await input.press("Enter");
  await expect(input).toHaveValue("");
};
