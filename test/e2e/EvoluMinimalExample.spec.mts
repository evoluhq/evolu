import { expect } from "playwright/test";
import { addTodo, readMnemonic, restorePrompt, test } from "./fixtures.mts";

// The minimal playground: one query, adding, completing, and deleting todos,
// and its one account's restore and deletion. The full playground's spec
// covers the rest.
test("adds, completes, and deletes todos, which survive a reload", async ({
  page,
}) => {
  await page.goto("/playgrounds/minimal");
  const input = page.getByPlaceholder("Add a new todo...");
  for (const title of ["First todo", "Second todo"]) {
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("checkbox", { name: title })).toBeVisible();
    // onSuccess clears the input once the todo is stored.
    await expect(input).toHaveValue("");
  }

  const first = page.getByRole("checkbox", { name: "First todo" });
  await first.click();
  await expect(first).toBeChecked();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Second todo" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("checkbox", { name: "Second todo" })).toHaveCount(
    0,
  );

  await page.reload();
  await expect(first).toBeChecked();
  await expect(page.getByRole("checkbox")).toHaveCount(1);
});

const deleteConfirm =
  "Delete this account? It's removed from this device, and only its mnemonic brings back what synced.";
const replaceConfirm =
  "Replace this account? It's removed from this device, and only its mnemonic brings back what synced.";

test("restores the account in another browser, and here after deleting it", async ({
  browserEvents,
  page,
}) => {
  await page.goto("/playgrounds/minimal");
  await addTodo(page, "Synced todo");
  const mnemonic = await readMnemonic(page);

  // Restoring in another browser replaces its account and proves the todo
  // reached the relay.
  const otherPage = await (await browserEvents.newContext()).newPage();
  await otherPage.goto("/playgrounds/minimal");
  // Showing its own mnemonic first proves the account UI handles clicks.
  expect(await readMnemonic(otherPage)).not.toBe(mnemonic);
  browserEvents.acceptNextDialog(restorePrompt, mnemonic);
  browserEvents.acceptNextDialog(replaceConfirm);
  await otherPage.getByRole("button", { name: "Restore Account" }).click();
  await expect(
    otherPage.getByRole("checkbox", { name: "Synced todo" }),
  ).toBeVisible();
  expect(await readMnemonic(otherPage)).toBe(mnemonic);

  // Deleting the account here leaves none, and its mnemonic brings the synced
  // todo back.
  browserEvents.acceptNextDialog(deleteConfirm);
  await page.getByRole("button", { name: "Delete Account" }).click();
  await expect(page.getByText("No account is open.")).toBeVisible();
  browserEvents.acceptNextDialog(restorePrompt, mnemonic);
  await page.getByRole("button", { name: "Restore Account" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Synced todo" }),
  ).toBeVisible();
});

test("creates a new, empty account after deleting the account", async ({
  browserEvents,
  page,
}) => {
  await page.goto("/playgrounds/minimal");
  await addTodo(page, "Old todo");
  const mnemonic = await readMnemonic(page);

  browserEvents.acceptNextDialog(deleteConfirm);
  await page.getByRole("button", { name: "Delete Account" }).click();
  await expect(page.getByText("No account is open.")).toBeVisible();
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByPlaceholder("Add a new todo...")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  expect(await readMnemonic(page)).not.toBe(mnemonic);
});
