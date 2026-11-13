import { expect } from "playwright/test";
import {
  addProject,
  addTodo,
  afterRestart,
  countPersistCalls,
  namePrompt,
  readMnemonic,
  restoreMnemonic,
  test as base,
} from "./fixtures.mts";

const notPersistedNotice =
  "Your data isn't kept on this device. Changes that haven't synced are lost when you close this tab.";

const test = /*#__PURE__*/ base.extend({
  context: async ({ browserEvents }, runTest) => {
    await runTest(await browserEvents.newPrivateContext());
  },
});

test.skip(
  ({ browserName }) => browserName === "chromium",
  "Chromium's incognito has OPFS, as the contexts of the other specs do.",
);

test.beforeEach(async ({ page }) => {
  await page.goto("/playgrounds/full/instant");
  // Without this check, a browser that adds OPFS to private browsing would
  // turn these tests into persistent ones.
  const hasOpfs = await page.evaluate(async () => {
    try {
      await navigator.storage.getDirectory();
      return true;
    } catch {
      return false;
    }
  });
  expect(hasOpfs, "Private browsing has no OPFS").toBe(false);
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await expect(page.getByText(notPersistedNotice)).toBeVisible();
});

test("keeps data in memory and restores synced data from the relay", async ({
  browserEvents,
  page,
  relay,
}) => {
  test.slow();
  await addProject(browserEvents, page, "Project");
  await addTodo(page, "Synced todo");
  const todo = page.getByRole("checkbox", { name: "Synced todo", exact: true });
  await todo.click();
  await expect(todo).toBeChecked();
  const mnemonic = await readMnemonic(page);

  // A regular context, with this tab's AppOwner restored from its mnemonic,
  // proves the relay has the change before it stops.
  const otherContext = await browserEvents.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto("/playgrounds/full/instant");
  await expect(
    otherPage.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await restoreMnemonic(browserEvents, otherPage, mnemonic);
  await expect(
    otherPage.getByRole("checkbox", { name: "Synced todo", exact: true }),
  ).toBeChecked();
  await otherContext.close();

  await relay.stop();
  await addTodo(page, "Unsynced todo");
  await expect(page.getByRole("checkbox")).toHaveCount(2);

  // Reloading ends this tab's memory databases, also the one that kept its
  // AppOwner, so it starts with a new, empty AppOwner.
  await page.reload();
  await expect(page.getByRole("status")).toHaveText(
    "Can't reach the sync server. Changes will sync once the connection is back.",
  );
  await expect(page.getByText(notPersistedNotice)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();

  // Restored from its mnemonic, the AppOwner gets its synced data back from
  // the relay, without the change that never left the tab.
  await restoreMnemonic(browserEvents, page, mnemonic);
  await relay.start();
  await expect(todo).toBeChecked(afterRestart);
  await expect(page.getByRole("checkbox")).toHaveCount(1);
});

test("starts the passkey variant in memory, without a passkey", async ({
  browserEvents,
  page,
}) => {
  await page.addInitScript(() => {
    // WebKit's GTK and WPE ports, which Playwright's WebKit on Linux is built
    // from, have no WebAuthn, so no passkey can be requested there
    // (https://bugs.webkit.org/show_bug.cgi?id=205350).
    if (!("credentials" in navigator)) return;
    const refuse = () =>
      Promise.reject(new Error("No passkey where nothing persists"));
    navigator.credentials.create = refuse;
    navigator.credentials.get = refuse;
  });
  // No passkey is requested, so 127.0.0.1 serves it as well as localhost.
  await page.goto("/playgrounds/full/passkey");
  await expect(
    page.getByText("This browser keeps nothing here, as in private browsing"),
  ).toBeVisible();
  // The first start offers to create or restore an account, and no unlock.
  await expect(
    page.getByText("No account is open on this device."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock" })).toHaveCount(0);
  browserEvents.acceptNextPrompt(namePrompt, "Account 1");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await expect(page.getByText(notPersistedNotice)).toBeVisible();
});

test("does not ask the browser to keep data it keeps in memory", async ({
  browserEvents,
  page,
}) => {
  const persistCallCount = await countPersistCalls(page);
  await page.reload();
  await expect(page.getByText(notPersistedNotice)).toBeVisible();

  await addProject(browserEvents, page, "In memory");

  expect(await persistCallCount()).toBe(0);
});

test("keeps private tabs separate while the relay is stopped", async ({
  browserEvents,
  context,
  page,
  relay,
}) => {
  await relay.stop();
  const otherPage = await context.newPage();
  await otherPage.goto("/playgrounds/full/instant");
  await expect(
    otherPage.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  // With the first tab's AppOwner, only their memory databases separate them.
  await restoreMnemonic(browserEvents, otherPage, await readMnemonic(page));

  await addProject(browserEvents, otherPage, "Second tab's project");
  await addTodo(otherPage, "Unsynced todo");
  // The first tab's mutations complete after the second tab's are stored, so
  // if the tabs shared a database, the first tab's queries would already
  // include the second tab's project and todo.
  await addProject(browserEvents, page, "First tab's project");
  await addTodo(page, "Only in the first tab");
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(otherPage.getByRole("checkbox")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Second tab's project" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Unsynced todo" }),
  ).toHaveCount(0);
});

test("keeps a private tab's unsynced data when the first tab closes", async ({
  browserEvents,
  context,
  page,
  relay,
}) => {
  await relay.stop();
  const otherPage = await context.newPage();
  await otherPage.goto("/playgrounds/full/instant");
  await expect(
    otherPage.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await restoreMnemonic(browserEvents, otherPage, await readMnemonic(page));
  await addProject(browserEvents, otherPage, "Project");
  await addTodo(otherPage, "Unsynced todo");

  await page.close();

  const todo = otherPage.getByRole("checkbox", {
    name: "Unsynced todo",
    exact: true,
  });
  // A fresh mutation proves the surviving instance still serves its database
  // after the first tab and any workers it hosted have ended.
  await addTodo(otherPage, "After the first tab closed");
  await expect(otherPage.getByRole("checkbox")).toHaveCount(2);
  await todo.click();
  await expect(todo).toBeChecked();
});

test("syncs live changes between private tabs through the relay", async ({
  browserEvents,
  context,
  page,
}) => {
  // Each private tab has its own AppOwner, so the second tab restores the
  // first one's, as tabs that must sync do.
  const otherPage = await context.newPage();
  await otherPage.goto("/playgrounds/full/instant");
  await expect(
    otherPage.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await restoreMnemonic(browserEvents, otherPage, await readMnemonic(page));

  await addProject(browserEvents, page, "Shared project");
  await expect(
    otherPage.getByRole("heading", { name: "Shared project" }),
  ).toBeVisible();
  await addTodo(page, "Shared todo");
  const otherTodo = otherPage.getByRole("checkbox", {
    name: "Shared todo",
    exact: true,
  });
  await otherTodo.click();
  await expect(otherTodo).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Shared todo", exact: true }),
  ).toBeChecked();

  await otherPage.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});
