import { expect, type Page } from "playwright/test";
import { addTodo, test } from "./fixtures.mts";

const openExample = async (page: Page): Promise<void> => {
  await page.goto("/playgrounds/local-only");
  await expect(page.getByPlaceholder("Add a new todo...")).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await openExample(page);
  await expect(page.getByRole("listitem")).toHaveCount(0);
});

test("keeps todos after reload", async ({ page }) => {
  await addTodo(page, "Keep me");
  const todo = page.getByRole("checkbox", { name: "Keep me", exact: true });
  await todo.click();
  await expect(todo).toBeChecked();

  await page.reload();
  await expect(page.getByPlaceholder("Add a new todo...")).toBeVisible();
  await expect(todo).toBeChecked();
});

test("deletes all data in every tab, after which the app starts empty", async ({
  browserEvents,
  context,
  page,
}) => {
  const otherPage = await context.newPage();
  await openExample(otherPage);
  await addTodo(page, "Delete me");
  await expect(
    otherPage.getByRole("checkbox", { name: "Delete me", exact: true }),
  ).toBeVisible();

  // The example sets no onDatabaseDeleted, so Evolu reloads both tabs.
  const reloads = [page, otherPage].map((tab) => tab.waitForEvent("load"));
  browserEvents.acceptNextDialog(
    "Delete all data on this device? This can't be undone.",
  );
  await page
    .getByRole("button", { name: "Delete All Data", exact: true })
    .click();
  await Promise.all(reloads);

  // Without a relay, nothing could restore the todo.
  for (const tab of [page, otherPage]) {
    await expect(tab.getByPlaceholder("Add a new todo...")).toBeVisible();
    await expect(tab.getByRole("listitem")).toHaveCount(0);
  }

  await addTodo(otherPage, "After deletion");
  await expect(
    page.getByRole("checkbox", { name: "After deletion", exact: true }),
  ).toBeVisible();
});
