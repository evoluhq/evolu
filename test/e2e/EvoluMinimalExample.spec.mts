import { expect } from "playwright/test";
import { expectStaysVisible } from "./expectStaysVisible.mts";
import { addTodo, test } from "./fixtures.mts";

test.beforeEach(async ({ page }) => {
  await page.goto("/playgrounds/minimal");
  await expect(page.getByPlaceholder("Add a new todo...")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(0);
});

test("creates, completes, renames, and deletes a todo", async ({
  browserEvents,
  page,
}) => {
  const input = page.getByPlaceholder("Add a new todo...");
  await input.fill("  First todo  ");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  // The example clears the input in the mutation's onComplete callback.
  await expect(input).toHaveValue("");
  await expect(page.getByRole("listitem")).toHaveCount(1);

  const todo = page.getByRole("checkbox", { name: "First todo", exact: true });
  await expect(todo).not.toBeChecked();
  // The controlled checkbox updates after SQLite acknowledges the mutation.
  await todo.click();
  await expect(todo).toBeChecked();

  browserEvents.acceptNextDialog("Edit todo", "Renamed todo");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Renamed todo", exact: true }),
  ).toBeChecked();
  await expect(todo).toHaveCount(0);

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(0);
});

test("keeps todos and deletions after reload", async ({ page }) => {
  await addTodo(page, "Keep me");
  await page.getByRole("checkbox", { name: "Keep me", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Keep me", exact: true }),
  ).toBeChecked();

  await addTodo(page, "Delete me");
  await page
    .getByRole("listitem")
    .filter({ hasText: "Delete me" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByRole("listitem")).toHaveCount(1);

  await page.reload();
  await expect(page.getByPlaceholder("Add a new todo...")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(
    page.getByRole("checkbox", { name: "Keep me", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Delete me", exact: true }),
  ).toHaveCount(0);
});

test("shares live changes between tabs without Suspense flicker", async ({
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
  await expect(otherTodo).toBeVisible();

  await page.bringToFront();
  const input = page.getByPlaceholder("Add a new todo...");
  await input.fill("Unfinished draft");

  // The example's Suspense fallback is null. Watch the persistent input and
  // its ancestors so even a brief hide/show between assertions is recorded.
  await expectStaysVisible(
    input,
    "Loaded UI must not disappear during updates",
    async () => {
      await otherPage.bringToFront();
      await otherTodo.click();
      await expect(otherTodo).toBeChecked();
      await page.bringToFront();
      await expect(
        page.getByRole("checkbox", { name: "Shared todo", exact: true }),
      ).toBeChecked();
      await expect(input).toHaveValue("Unfinished draft");

      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page.getByRole("listitem")).toHaveCount(0);
      await expect(otherPage.getByRole("listitem")).toHaveCount(0);

      await otherPage.bringToFront();
      await addTodo(otherPage, "From the second tab");
      await page.bringToFront();
      await expect(
        page.getByRole("checkbox", {
          name: "From the second tab",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("listitem")).toHaveCount(1);
      await expect(input).toHaveValue("Unfinished draft");
    },
  );
});

test("syncs between isolated browser contexts through the relay", async ({
  browserEvents,
  page,
}) => {
  await addTodo(page, "Synced todo");

  // This context has its own OPFS database and SharedWorker. The relay is
  // the only path by which it can receive the first context's data.
  const otherContext = await browserEvents.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto(page.url());
  const otherTodo = otherPage.getByRole("checkbox", {
    name: "Synced todo",
    exact: true,
  });
  await expect(otherTodo).toBeVisible();
  await otherTodo.click();
  await expect(otherTodo).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Synced todo", exact: true }),
  ).toBeChecked();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(0);
  await expect(otherPage.getByRole("listitem")).toHaveCount(0);
});
