import { expect } from "playwright/test";
import {
  addTodo,
  afterRestart,
  countPersistCalls,
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
  await page.goto("/playgrounds/minimal");
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
  await expect(page.getByPlaceholder("Add a new todo...")).toBeVisible();
  await expect(page.getByText(notPersistedNotice)).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(0);
});

test("keeps data in memory and restores synced data from the relay", async ({
  browserEvents,
  page,
  relay,
}) => {
  test.slow();
  await addTodo(page, "Synced todo");
  const todo = page.getByRole("checkbox", { name: "Synced todo", exact: true });
  await todo.click();
  await expect(todo).toBeChecked();

  // A regular context proves the relay has the change before it stops.
  const otherContext = await browserEvents.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto("/playgrounds/minimal");
  await expect(
    otherPage.getByRole("checkbox", { name: "Synced todo", exact: true }),
  ).toBeChecked();
  await otherContext.close();

  await relay.stop();
  await addTodo(page, "Unsynced todo");
  await expect(page.getByRole("listitem")).toHaveCount(2);

  // Reloading ends this instance and its memory database.
  await page.reload();
  await expect(page.getByRole("status")).toHaveText(
    "Can't reach the sync server. Changes will sync once the connection is back.",
  );
  await expect(page.getByText(notPersistedNotice)).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(0);

  await relay.start();
  await expect(todo).toBeChecked(afterRestart);
  await expect(page.getByRole("listitem")).toHaveCount(1);
});

test("does not ask the browser to keep data it keeps in memory", async ({
  page,
}) => {
  const persistCallCount = await countPersistCalls(page);
  await page.reload();
  await expect(page.getByText(notPersistedNotice)).toBeVisible();

  await addTodo(page, "In memory");

  expect(await persistCallCount()).toBe(0);
});

test("keeps private tabs separate while the relay is stopped", async ({
  context,
  page,
  relay,
}) => {
  await relay.stop();
  const otherPage = await context.newPage();
  await otherPage.goto("/playgrounds/minimal");
  await expect(otherPage.getByPlaceholder("Add a new todo...")).toBeVisible();

  await addTodo(otherPage, "Unsynced todo");
  // The first tab's mutation completes after the second tab's is stored, so if
  // the tabs shared a database, the first tab's query would already include the
  // second tab's todo.
  await addTodo(page, "Only in the first tab");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(otherPage.getByRole("listitem")).toHaveCount(1);
  await expect(
    page.getByRole("checkbox", { name: "Unsynced todo" }),
  ).toHaveCount(0);
});

test("keeps a private tab's unsynced data when the first tab closes", async ({
  context,
  page,
  relay,
}) => {
  await relay.stop();
  const otherPage = await context.newPage();
  await otherPage.goto("/playgrounds/minimal");
  await expect(otherPage.getByPlaceholder("Add a new todo...")).toBeVisible();
  await addTodo(otherPage, "Unsynced todo");

  await page.close();

  const todo = otherPage.getByRole("checkbox", {
    name: "Unsynced todo",
    exact: true,
  });
  // A fresh mutation proves the surviving instance still serves its database
  // after the first tab and any workers it hosted have ended.
  await addTodo(otherPage, "After the first tab closed");
  await expect(otherPage.getByRole("listitem")).toHaveCount(2);
  await todo.click();
  await expect(todo).toBeChecked();
});

test("syncs live changes between private tabs through the relay", async ({
  context,
  page,
}) => {
  const otherPage = await context.newPage();
  await otherPage.goto("/playgrounds/minimal");
  await expect(otherPage.getByPlaceholder("Add a new todo...")).toBeVisible();

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
  await expect(page.getByRole("listitem")).toHaveCount(0);
});
