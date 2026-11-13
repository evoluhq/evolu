import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, test, vi } from "vitest";
import {
  AppView,
  ExampleShell,
  type App,
} from "../../../../apps/web/src/app/(playgrounds)/playgrounds/full/EvoluFullExample.tsx";
import { emptyArray } from "../../../../packages/common/src/Array.ts";
import {
  assert,
  assertEqual,
  assertNonNullable,
} from "../../../../packages/common/src/Assert.ts";
import { createUnknownError } from "../../../../packages/common/src/Error.ts";
import { constVoid } from "../../../../packages/common/src/Function.ts";
import type {
  AppOwnerEntry,
  CurrentAppOwner,
} from "../../../../packages/common/src/local-first/Evolu.ts";
import {
  createAppOwner,
  createOwnerSecret,
  testAppOwner,
  type AppOwner,
} from "../../../../packages/common/src/local-first/Owner.ts";
import type { QueryRows } from "../../../../packages/common/src/local-first/Query.ts";
import { ok } from "../../../../packages/common/src/Result.ts";
import { createStore } from "../../../../packages/common/src/Store.ts";
import { testCreateDeps } from "../../../../packages/common/src/Task.ts";

beforeAll(() => {
  // Tells React that updates are wrapped in act.
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

// The full playground's page with an app whose open AppOwner's queries fail,
// as SQLite fails them on a corrupt page. The tab's own error boundary shows
// the failure, and the tab bar and the sections outside it keep working.

/** A promise React's `use` reads without suspending. */
const fulfilled = <T>(value: T): Promise<T> =>
  Object.assign(Promise.resolve(value), { status: "fulfilled", value });

/** A rejected promise React's `use` throws without suspending. */
const rejected = (reason: unknown): Promise<never> => {
  // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Evolu rejects a failed query with a plain-object error.
  const promise = Promise.reject(reason);
  promise.catch(constVoid);
  return Object.assign(promise, { status: "rejected", reason });
};

const queryError = createUnknownError(
  new Error("database disk image is malformed"),
);
const otherAppOwner = createAppOwner(
  createOwnerSecret(testCreateDeps({ seed: "other" })),
);

/** An instance of the AppOwner whose queries all load `load`. */
const setupInstance = (
  appOwner: AppOwner,
  load: () => Promise<QueryRows>,
): CurrentAppOwner<never> => ({
  appOwner,
  evolu: fulfilled({
    name: "FullExampleTest",
    appOwner,
    devicePersistence: fulfilled("Persisted"),
    loadQuery: load,
    loadQueries: (queries: ReadonlyArray<unknown>) => queries.map(load),
    subscribeQuery: () => constVoid,
    getQueryRows: () => emptyArray,
    useOwner: () => constVoid,
  } as never),
});

/** An app with two AppOwners, the open one's queries failing. */
const setupApp = () => {
  const failing = setupInstance(testAppOwner, () => rejected(queryError));
  const current = createStore<CurrentAppOwner<never> | null>(failing);
  const appOwners = createStore<ReadonlyArray<AppOwnerEntry>>([
    { id: testAppOwner.id, name: null, lastOpenedAt: null },
    { id: otherAppOwner.id, name: null, lastOpenedAt: null },
  ]);
  const app = {
    current,
    appOwners,
    open: () => {
      current.set(
        setupInstance(otherAppOwner, () => fulfilled(emptyArray as QueryRows)),
      );
    },
    remove: (id: AppOwner["id"]) => {
      current.set(null);
      appOwners.set(appOwners.get().filter((entry) => entry.id !== id));
      return Promise.resolve(ok());
    },
  } as unknown as App;
  return fulfilled(app);
};

/**
 * Renders the page with the app, confirming every dialog, and returns its
 * container.
 */
const setupPage = async () => {
  const container = document.createElement("div");
  document.body.append(container);
  // React would log the error the data's boundary catches on purpose.
  const root = createRoot(container, { onCaughtError: constVoid });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const app = setupApp();
  // oxlint-disable-next-line typescript/require-await -- An async act waits for the renders that suspend.
  await act(async () => {
    root.render(
      createElement(ExampleShell, {
        intro: null,
        // oxlint-disable-next-line react/no-children-prop -- createElement needs required children as a prop.
        children: createElement(AppView, { app }),
      }),
    );
  });
  return {
    container,
    accounts: (): ReadonlyArray<HTMLElement> => {
      const list = container.querySelector(
        '[aria-label="Accounts on this device"]',
      );
      assertNonNullable(list);
      return [...list.querySelectorAll("li")];
    },
    [Symbol.dispose]: () => {
      act(() => {
        root.unmount();
      });
      confirm.mockRestore();
      container.remove();
    },
  };
};

const clickButton = async (scope: HTMLElement, text: string): Promise<void> => {
  const button = [...scope.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  );
  assertNonNullable(button, text);
  // oxlint-disable-next-line typescript/require-await -- An async act waits for the renders that suspend.
  await act(async () => {
    button.click();
  });
};

test("shows a failed query in place of the data and keeps the other sections", async () => {
  using page = await setupPage();
  const text = page.container.textContent;
  assert(text.includes("This tab's data couldn't load."), "data alert");
  assert(!text.includes("The app couldn't start."), "no startup failure");
  // The boundary holds only the tab's content, so the tab bar stays.
  for (const tab of ["Home", "Projects", "Trash"])
    assertNonNullable(
      [...page.container.querySelectorAll("button")].find(
        (button) => button.textContent === tab,
      ),
      tab,
    );
  assertEqual(page.accounts().length, 2);
  for (const section of ["Accounts", "Relays"])
    assertNonNullable(
      page.container.querySelector(`section[aria-label="${section}"]`),
      section,
    );
});

test("opens another account, whose data loads", async () => {
  using page = await setupPage();
  await clickButton(page.accounts()[1], "Open");
  const text = page.container.textContent;
  assert(!text.includes("This tab's data couldn't load."), "no alert");
  assert(text.includes("No projects yet"), "the other account's data");
});

test("removes the account whose data failed to load", async () => {
  using page = await setupPage();
  await clickButton(page.accounts()[0], "Remove");
  assert(
    page.container.textContent.includes("No account is open on this device."),
    "no account open",
  );
  assertEqual(page.accounts().length, 1);
});
