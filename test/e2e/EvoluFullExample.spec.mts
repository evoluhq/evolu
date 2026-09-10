import { expect, type Page } from "playwright/test";
import { expectStaysVisible } from "./expectStaysVisible.mts";
import { addTodo, test, type BrowserEvents } from "./fixtures.mts";

test.beforeEach(async ({ page }) => {
  await page.goto("/playgrounds/full");
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
});

test("creates, renames, moves, and completes todos between projects", async ({
  browserEvents,
  page,
}) => {
  await setupProject(browserEvents, page, "First project");
  await addTodo(page, "  First todo  ");
  const todo = page.getByRole("checkbox", { name: "First todo", exact: true });
  await expect(todo).not.toBeChecked();
  await todo.click();
  await expect(todo).toBeChecked();

  browserEvents.acceptNextDialog("Edit todo", "Renamed todo");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Renamed todo" }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "View History" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Projects", exact: true }).click();
  browserEvents.acceptNextDialog("Edit project name", "Renamed project");
  await page.getByRole("button", { name: "Rename Project" }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed project" }),
  ).toBeVisible();
  await setupProject(browserEvents, page, "Second project");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Change Project" }).click();
  await page.getByRole("menuitem", { name: "Second project" }).click();

  const firstProject = page
    .getByRole("heading", { name: "Renamed project" })
    .locator("../..");
  const secondProject = page
    .getByRole("heading", { name: "Second project" })
    .locator("../..");
  await expect(firstProject.getByRole("listitem")).toHaveCount(0);
  await expect(
    secondProject.getByRole("checkbox", { name: "Renamed todo" }),
  ).toBeChecked();
  await page.reload();
  await expect(
    secondProject.getByRole("checkbox", { name: "Renamed todo" }),
  ).toBeChecked();
});

test("navigates to Trash without Suspense flicker and restores a todo", async ({
  browserEvents,
  page,
}) => {
  await setupProject(browserEvents, page, "Project");
  await addTodo(page, "Restore me");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(0);

  // The navigation stays mounted across views, inside the Suspense boundary.
  // Trash's queries have never loaded. An urgent update would hide this button
  // along with Home while they load; startTransition keeps Home visible.
  const home = page.getByRole("button", { name: "Home", exact: true });
  await expectStaysVisible(
    home,
    "Navigation must not disappear while Trash loads",
    async () => {
      await page.getByRole("button", { name: "Trash", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Restore me" }),
      ).toBeVisible();
      await expect(
        page.getByText("Project • Deleted", { exact: false }),
      ).toBeVisible();
    },
  );

  browserEvents.acceptNextDialog(
    'Are you sure you want to restore todo "Restore me"?',
  );
  await page.getByRole("button", { name: "Restore Todo" }).click();
  await expect(
    page.getByRole("heading", { name: "Trash is empty" }),
  ).toBeVisible();
  await home.click();
  await expect(
    page.getByRole("checkbox", { name: "Restore me" }),
  ).not.toBeChecked();
});

test("hides a deleted project's todos and restores them with the project", async ({
  browserEvents,
  page,
}) => {
  await setupProject(browserEvents, page, "Recoverable project");
  await addTodo(page, "Preserved todo");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  browserEvents.acceptNextDialog(
    'Are you sure you want to delete project "Recoverable project"?',
  );
  await page.getByRole("button", { name: "Delete Project" }).click();
  await expect(
    page.getByRole("heading", { name: "Recoverable project" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Preserved todo" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recoverable project" }),
  ).toBeVisible();
  // Deleting the parent hides children without individually deleting them.
  await expect(
    page.getByRole("heading", { name: "Deleted Todos" }),
  ).toHaveCount(0);
  browserEvents.acceptNextDialog(
    'Are you sure you want to restore project "Recoverable project"?',
  );
  await page.getByRole("button", { name: "Restore Project" }).click();
  await expect(
    page.getByRole("heading", { name: "Trash is empty" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Preserved todo" }),
  ).toBeVisible();
});

test("shows the test mnemonic and labels unfinished account actions", async ({
  page,
}) => {
  await expect(
    page.getByText("This example uses a shared test identity.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  // The top banner mentions the same actions; match text unique to this card.
  await expect(
    page.getByText("A production app needs its own identity", {
      exact: false,
    }),
  ).toBeVisible();
  for (const name of [
    "Restore from Mnemonic",
    "Reset All Data",
    "Download Backup",
  ]) {
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  }
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Mnemonic" }).click();
  await expect(page.getByRole("textbox")).toHaveValue(/^(\w+ ){23}\w+$/u);
  await expect(page.getByRole("textbox")).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Hide Mnemonic" }).click();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

const setupProject = async (
  browserEvents: BrowserEvents,
  page: Page,
  name: string,
) => {
  browserEvents.acceptNextDialog("What's the project name?", name);
  await page.getByRole("button", { name: "Add new project" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
};
