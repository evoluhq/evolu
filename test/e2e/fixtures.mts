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
} from "playwright/test";
import { relayUrl } from "./playwright.config.mts";

export interface E2eOptions {
  readonly relayEntry: string;
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
  E2eOptions & { browserEvents: BrowserEvents; relay: void }
>({
  relayEntry: ["apps/relay/dist/src/index.js", { option: true }],

  relay: async ({ relayEntry }, runTest, testInfo) => {
    const directory = await mkdtemp(join(tmpdir(), "evolu-e2e-relay-"));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) =>
          name.toUpperCase() !== "PORT" &&
          !name.toUpperCase().startsWith("EVOLU_RELAY_"),
      ),
    );
    const port = new URL(relayUrl).port;
    const relay = spawn(
      process.execPath,
      [resolve(import.meta.dirname, "../..", relayEntry)],
      {
        cwd: directory,
        env: { ...env, PORT: port },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const closed = new Promise<void>((resolve) => {
      relay.once("close", () => resolve());
    });
    let output = "";
    let startupError: Error | undefined;
    relay.once("error", (error) => {
      startupError = error;
    });
    relay.stdout.setEncoding("utf8").on("data", (data: string) => {
      output += data;
    });
    relay.stderr.setEncoding("utf8").on("data", (data: string) => {
      output += data;
    });

    let started = false;
    try {
      // Wait for this process, rather than an unrelated server on the port.
      await expect
        .poll(
          () => {
            if (startupError) throw startupError;
            if (relay.exitCode !== null) throw new Error(output);
            return output.includes(`Started on port ${port}`);
          },
          { message: "Relay startup", timeout: 10_000 },
        )
        .toBe(true);
      started = true;
      await runTest();
    } finally {
      const exitedDuringTest =
        relay.exitCode !== null || relay.signalCode !== null;
      relay.kill();
      const forceKill = setTimeout(() => {
        relay.kill("SIGKILL");
      }, 5_000);
      try {
        await closed;
      } finally {
        clearTimeout(forceKill);
        await rm(directory, { recursive: true, force: true });
        await testInfo.attach("relay.log", {
          body: output,
          contentType: "text/plain",
        });
      }
      if (started) {
        // A relay defect sets a non-zero exit status without exiting.
        expect(
          exitedDuringTest,
          `Relay exited during the test:\n${output}`,
        ).toBe(false);
        expect(relay.exitCode, `Relay shutdown status:\n${output}`).toBe(0);
      }
    }
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
