import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  expect,
  test as base,
  type Browser,
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
 * Options for the first check after a relay restarts. A client retries with a
 * jittered backoff that grows with the downtime, up to 30 seconds, so the check
 * waits that long plus a round, in a test given more time.
 */
export const afterRestart = { timeout: 35_000 };

/**
 * Fails the test on uncaught browser errors and unexpected dialogs in every
 * watched context, and accepts the dialogs a test declares.
 */
export interface BrowserEvents {
  readonly watch: (context: BrowserContext) => void;
  /** Creates a watched context that closes when the test ends. */
  readonly newContext: () => Promise<BrowserContext>;
  /**
   * Creates a watched private browsing context that closes when the test ends.
   * Firefox and WebKit offer no OPFS there, while Chromium's incognito does.
   */
  readonly newPrivateContext: () => Promise<BrowserContext>;
  /**
   * Accepts the next dialog after checking its message; a prompt receives
   * `value`, or keeps what it was prefilled with. Any other dialog, including
   * the examples' Evolu error alert, is dismissed and fails the test.
   */
  readonly acceptNextDialog: (message: string, value?: string) => void;
  /**
   * Accepts the next prompt as prefilled after checking its message and that it
   * was prefilled with `defaultValue`.
   */
  readonly acceptNextPrompt: (message: string, defaultValue: string) => void;
  /** Dismisses the next dialog after checking its message. */
  readonly dismissNextDialog: (message: string) => void;
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

  browserEvents: async (
    { baseURL, browser, browserName, playwright, relay: _relay },
    runTest,
  ) => {
    const failures: Array<string> = [];
    const expectedDialogs: Array<
      | { type: "Accept"; message: string; value: string | undefined }
      | { type: "AcceptPrefilled"; message: string; defaultValue: string }
      | { type: "Dismiss"; message: string }
    > = [];
    const contexts: Array<BrowserContext> = [];
    const privateBrowsers: Array<Browser> = [];
    const webkitHomes: Array<string> = [];

    const recordFailure = (error: unknown) => {
      failures.push(String(error));
    };

    const handleDialog = (dialog: Dialog) => {
      const expected = expectedDialogs[0];
      if (expected !== undefined && dialog.message() === expected.message) {
        expectedDialogs.shift();
        if (
          expected.type === "AcceptPrefilled" &&
          dialog.defaultValue() !== expected.defaultValue
        )
          failures.push(
            `Prompt "${expected.message}" prefilled "${dialog.defaultValue()}", not "${expected.defaultValue}"`,
          );
        (expected.type === "Dismiss"
          ? dialog.dismiss()
          : dialog.accept(
              expected.type === "Accept" && expected.value !== undefined
                ? expected.value
                : dialog.defaultValue(),
            )
        ).catch(recordFailure);
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

    const track = (context: BrowserContext): BrowserContext => {
      watch(context);
      contexts.push(context);
      return context;
    };

    await runTest({
      watch,
      newContext: async () => {
        let context: BrowserContext;
        if (browserName === "webkit") {
          // WebKit has OPFS only in persistent contexts, and on macOS they all
          // share the home directory's website data unless it is overridden.
          const home = await mkdtemp(join(tmpdir(), "evolu-e2e-webkit-"));
          webkitHomes.push(home);
          context = await playwright.webkit.launchPersistentContext(
            join(home, "profile"),
            {
              ...(baseURL && { baseURL }),
              env: { ...process.env, CFFIXED_USER_HOME: home },
            },
          );
        } else {
          context = await browser.newContext({ ...(baseURL && { baseURL }) });
        }
        return track(context);
      },
      newPrivateContext: async () => {
        if (browserName !== "firefox") {
          // Playwright's ephemeral contexts are Chromium's incognito and
          // WebKit's private browsing.
          return track(
            await browser.newContext({ ...(baseURL && { baseURL }) }),
          );
        }
        // Firefox makes its windows private only with this pref at launch.
        const privateBrowser = await playwright.firefox.launch({
          firefoxUserPrefs: { "browser.privatebrowsing.autostart": true },
        });
        privateBrowsers.push(privateBrowser);
        return track(
          await privateBrowser.newContext({ ...(baseURL && { baseURL }) }),
        );
      },
      acceptNextDialog: (message, value) => {
        expectedDialogs.push({ type: "Accept", message, value });
      },
      acceptNextPrompt: (message, defaultValue) => {
        expectedDialogs.push({
          type: "AcceptPrefilled",
          message,
          defaultValue,
        });
      },
      dismissNextDialog: (message) => {
        expectedDialogs.push({ type: "Dismiss", message });
      },
    });

    for (const context of contexts) await context.close();
    for (const privateBrowser of privateBrowsers) await privateBrowser.close();
    for (const home of webkitHomes) {
      await rm(home, { recursive: true, force: true });
    }
    expect(failures, "Browser errors and unexpected dialogs").toEqual([]);
    expect(expectedDialogs, "Expected dialogs that did not appear").toEqual([]);
  },

  context: async ({ browserEvents }, runTest) => {
    await runTest(await browserEvents.newContext());
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
 * Counts `navigator.storage.persist()` calls from the next page load on,
 * answering each without asking, so Firefox shows no permission prompt.
 */
export const countPersistCalls = async (
  page: Page,
): Promise<() => Promise<number>> => {
  await page.addInitScript(() => {
    const counter = StorageManager as unknown as { persistCalls: number };
    counter.persistCalls = 0;
    StorageManager.prototype.persist = () => {
      counter.persistCalls += 1;
      return Promise.resolve(false);
    };
  });
  return () =>
    page.evaluate(
      () =>
        (StorageManager as unknown as { persistCalls: number }).persistCalls,
    );
};

/**
 * Adds a project through the full playground's prompt, from the one "Add
 * Project" button on the page: on Home while it has no project, or on the
 * Projects tab.
 */
export const addProject = async (
  browserEvents: BrowserEvents,
  page: Page,
  name: string,
): Promise<void> => {
  browserEvents.acceptNextDialog("What's the project name?", name);
  await page.getByRole("button", { name: "Add Project", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
};

/**
 * Adds a todo with Enter to the page's only project. The playground clears the
 * input in the mutation's onSuccess callback.
 */
export const addTodo = async (page: Page, title: string): Promise<void> => {
  const input = page.getByPlaceholder("Add a new todo...");
  await input.fill(title);
  await input.press("Enter");
  await expect(input).toHaveValue("");
};

/** The message of the full playground's prompt to restore an AppOwner. */
export const restorePrompt = "Enter your mnemonic to restore your data:";

/**
 * The message of the full playground's prompt for an AppOwner's name, when it
 * creates, restores, or renames one.
 */
export const namePrompt = "Name this account";

/**
 * Reads the open AppOwner's mnemonic through the playground's account UI, as a
 * user copies it to sync another device.
 */
export const readMnemonic = async (page: Page): Promise<string> => {
  await page.getByRole("button", { name: /^show mnemonic$/iu }).click();
  const mnemonic = await page.locator("textarea[readonly]").inputValue();
  await page.getByRole("button", { name: /^hide mnemonic$/iu }).click();
  return mnemonic;
};

/**
 * Restores the AppOwner of `mnemonic` through the playground's restore prompt
 * in a page that has another AppOwner open, and waits until it's open: the
 * playground then shows that mnemonic. The open AppOwner's UI remounts, which
 * hides the mnemonic again, so each attempt shows it when it's hidden.
 */
export const restoreMnemonic = async (
  browserEvents: BrowserEvents,
  page: Page,
  mnemonic: string,
): Promise<void> => {
  // Showing the mnemonic of the AppOwner the page opened first proves its
  // account UI handles clicks, so the restore's click isn't lost.
  await readMnemonic(page);
  browserEvents.acceptNextDialog(restorePrompt, mnemonic);
  browserEvents.acceptNextDialog(namePrompt);
  await page.getByRole("button", { name: /^restore account$/iu }).click();
  const shown = page.locator("textarea[readonly]");
  // Each attempt's actions time out, and an attempt returns null when they do,
  // so an element that disappears in a remount ends the attempt rather than
  // the poll, which a throwing attempt would end.
  await expect
    .poll(async () => {
      try {
        if (!(await shown.isVisible()))
          await page
            .getByRole("button", { name: /^show mnemonic$/iu })
            .click({ timeout: 1_000 });
        return await shown.inputValue({ timeout: 1_000 });
      } catch {
        return null;
      }
    })
    .toBe(mnemonic);
  await page.getByRole("button", { name: /^hide mnemonic$/iu }).click();
};
