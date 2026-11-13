import { readFile } from "node:fs/promises";
import { expect, type Page } from "playwright/test";
import { expectStaysVisible } from "./expectStaysVisible.mts";
import {
  addProject,
  addTodo,
  afterRestart,
  countPersistCalls,
  readMnemonic,
  namePrompt,
  restoreMnemonic,
  restorePrompt,
  test,
  type BrowserEvents,
} from "./fixtures.mts";

// The instant start variant, which starts with an AppOwner. The passkey
// variant's own spec covers its start; the components are the same.

const openPlayground = async (page: Page): Promise<void> => {
  await page.goto("/playgrounds/full/instant");
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await openPlayground(page);
  // The notice shares the data's Suspense boundary, so it would show by now.
  await expect(
    page.getByText("Your data isn't kept on this device"),
  ).toHaveCount(0);
});

test("creates, renames, moves, completes, and deletes todos between projects", async ({
  browserEvents,
  page,
}) => {
  await addProject(browserEvents, page, "First project");
  await addTodo(page, "  First todo  ");
  const todo = page.getByRole("checkbox", { name: "First todo", exact: true });
  await expect(todo).not.toBeChecked();
  // The controlled checkbox updates after SQLite acknowledges the mutation.
  await todo.click();
  await expect(todo).toBeChecked();

  browserEvents.acceptNextDialog("Edit todo", "Renamed todo");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const renamed = page.getByRole("checkbox", { name: "Renamed todo" });
  await expect(renamed).toBeChecked();
  const priority = page.getByRole("combobox", { name: "Priority" });
  await priority.selectOption("high");
  // The select shows the stored row's value, so this waits for the write,
  // which a reload right after the change could cut off.
  await expect(priority).toHaveValue("high");
  await page.reload();
  await expect(priority).toHaveValue("high");

  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const projects = page.getByRole("list", { name: "Projects", exact: true });
  browserEvents.acceptNextDialog("Edit project name", "Renamed project");
  await projects.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed project" }),
  ).toBeVisible();
  await addProject(browserEvents, page, "Second project");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Project", exact: true })
    .selectOption({ label: "Second project" });

  const firstTodos = page.getByRole("list", { name: "Renamed project todos" });
  const secondTodos = page.getByRole("list", { name: "Second project todos" });
  await expect(firstTodos.getByRole("listitem")).toHaveCount(0);
  await expect(
    secondTodos.getByRole("checkbox", { name: "Renamed todo" }),
  ).toBeChecked();
  await page.reload();
  await expect(
    secondTodos.getByRole("checkbox", { name: "Renamed todo" }),
  ).toBeChecked();

  await secondTodos
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Second project" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("navigates to Trash without Suspense flicker and restores a todo", async ({
  browserEvents,
  page,
}) => {
  await addProject(browserEvents, page, "Project");
  await addTodo(page, "Restore me");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);

  // The navigation is inside the data's Suspense boundary, and Trash's queries
  // have never loaded. An urgent update would hide it along with Home while
  // they load; startTransition keeps Home visible.
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

  await page
    .getByRole("list", { name: "Deleted Todos" })
    .getByRole("button", { name: "Restore", exact: true })
    .click();
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
  await addProject(browserEvents, page, "Recoverable project");
  await addTodo(page, "Preserved todo");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  browserEvents.acceptNextDialog('Delete project "Recoverable project"?');
  await page
    .getByRole("list", { name: "Projects", exact: true })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recoverable project" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recoverable project" }),
  ).toBeVisible();
  // Deleting the parent hides children without individually deleting them.
  await expect(
    page.getByRole("heading", { name: "Deleted Todos" }),
  ).toHaveCount(0);
  await page
    .getByRole("list", { name: "Deleted Projects" })
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Trash is empty" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Preserved todo" }),
  ).toBeVisible();
});

test("asks the browser to keep the site's data after the first change", async ({
  browserEvents,
  page,
}) => {
  const persistCallCount = await countPersistCalls(page);
  await openPlayground(page);
  expect(await persistCallCount()).toBe(0);

  await addProject(browserEvents, page, "First");
  await expect.poll(persistCallCount).toBe(1);
  await addTodo(page, "Second");
  expect(await persistCallCount()).toBe(1);
});

test("shares live changes between tabs without Suspense flicker", async ({
  browserEvents,
  context,
  page,
}) => {
  await addProject(browserEvents, page, "Shared project");
  const otherPage = await context.newPage();
  await otherPage.goto("/playgrounds/full/instant");
  await expect(
    otherPage.getByRole("heading", { name: "Shared project" }),
  ).toBeVisible();

  await addTodo(page, "Shared todo");
  const otherTodo = otherPage.getByRole("checkbox", {
    name: "Shared todo",
    exact: true,
  });
  await expect(otherTodo).toBeVisible();

  await page.bringToFront();
  const input = page.getByPlaceholder("Add a new todo...");
  await input.fill("Unfinished draft");

  // Watch the persistent input and its ancestors so even a brief hide/show
  // between assertions is recorded.
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
      await expect(page.getByRole("checkbox")).toHaveCount(0);
      await expect(otherPage.getByRole("checkbox")).toHaveCount(0);

      await otherPage.bringToFront();
      await addTodo(otherPage, "From the second tab");
      await page.bringToFront();
      await expect(
        page.getByRole("checkbox", {
          name: "From the second tab",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("checkbox")).toHaveCount(1);
      await expect(input).toHaveValue("Unfinished draft");
    },
  );
});

test("syncs between isolated browser contexts through the relay", async ({
  browserEvents,
  page,
}) => {
  await addProject(browserEvents, page, "Synced project");
  await addTodo(page, "Synced todo");

  // This context has its own OPFS database, SharedWorker, and AppOwner, so the
  // user restores the first context's mnemonic there, as on another device.
  // The relay is the only path by which it can receive the first context's
  // data.
  const otherPage = await openAccountInNewContext(browserEvents, page);
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
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(otherPage.getByRole("checkbox")).toHaveCount(0);

  // A fresh database has only the relay's history. Waiting for the project
  // ensures the absence of the deleted todo is not an empty initial list.
  const fresh = await openAccountInNewContext(browserEvents, page);
  await expect(
    fresh.getByRole("heading", { name: "Synced project" }),
  ).toBeVisible();
  await expect(fresh.getByRole("checkbox")).toHaveCount(0);
});

test("shows when changes can't leave this device, and each relay's state", async ({
  browserEvents,
  page,
  relay,
}) => {
  test.slow();
  // One always-mounted live region shows the sync line, empty while sync works.
  const syncStatus = page.getByRole("status");
  // Sync problems are not alerts, not even the playground's evoluError alert.
  // Next.js adds a route announcer alert, empty without client navigation, so
  // count only alerts with text.
  const syncAlert = page.getByRole("alert").filter({ hasText: /\S/u });
  const relaysSection = page.getByRole("region", { name: "Relays" });
  const relays = page.getByRole("list", { name: "Relays", exact: true });
  await expect(relays.getByRole("listitem")).toHaveCount(1);
  await expect(relays).toContainText(relay.url);
  await expect(relays).toContainText("Up to date since");
  await expect(relaysSection).toContainText(
    "Up to date with the connected relays.",
  );

  await relay.stop();
  await expect(syncStatus).toHaveText(
    "Can't reach the sync server. Changes will sync once the connection is back.",
  );
  await expect(relays).toContainText("Disconnected since");
  await expect(relaysSection).toContainText(
    "No relay is connected. You can keep editing on this device.",
  );
  await expect(relaysSection).toContainText("0 of 1 relay connected");

  // A one-byte quota rejects every write.
  await relay.start({ EVOLU_RELAY_MAX_OWNER_BYTES: "1B" });
  await expect(syncStatus).toBeEmpty(afterRestart);
  await addProject(browserEvents, page, "Over quota");
  await expect(syncStatus).toHaveText(
    "Sync is paused because the sync server is full.",
  );
  await expect(relays).toContainText("Sync error: ProtocolQuotaError");
  await expect(relaysSection).toContainText(
    "A relay failed or holds a change this database cannot read.",
  );
  await expect(syncAlert).toHaveCount(0);

  await relay.stop();
  await relay.start();
  await expect(syncStatus).toBeEmpty(afterRestart);
  await expect(relays).toContainText("Up to date since");
});

test("creates, renames, opens, restores, and removes accounts", async ({
  browserEvents,
  page,
  relay,
}) => {
  test.slow();
  const accounts = page.getByRole("list", { name: "Accounts on this device" });
  const openAccount = accounts.getByRole("listitem").filter({
    hasText: "(open)",
  });
  await expect(accounts.getByRole("listitem")).toHaveCount(1);
  browserEvents.acceptNextDialog(namePrompt, "First account");
  await openAccount.getByRole("button", { name: "Rename" }).click();
  await expect(openAccount).toContainText("First account");
  await addProject(browserEvents, page, "First account's project");
  const firstMnemonic = await readMnemonic(page);
  expect(firstMnemonic).toMatch(/^(\w+ ){23}\w+$/u);
  // Another context receives the project only from the relay, so the relay
  // has it before the account is removed here.
  const otherPage = await openAccountInNewContext(browserEvents, page);
  await expect(
    otherPage.getByRole("heading", { name: "First account's project" }),
  ).toBeVisible();

  // A new account opens empty, under the default name, and the list shows the
  // one opened most recently first.
  browserEvents.acceptNextPrompt(namePrompt, "Account 2");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await expect(accounts.getByRole("listitem")).toHaveCount(2);
  await expect(accounts.getByRole("listitem").first()).toContainText(
    "Account 2 (open)",
  );
  expect(await readMnemonic(page)).not.toBe(firstMnemonic);

  await accounts
    .getByRole("listitem")
    .filter({ hasText: "First account" })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(
    page.getByRole("heading", { name: "First account's project" }),
  ).toBeVisible();
  await expect(openAccount).toContainText("First account");

  browserEvents.acceptNextDialog(
    "Remove First account? This removes it from this device and deletes its data here. Changes that haven't synced are lost. Synced data comes back when you restore the mnemonic.",
  );
  await openAccount.getByRole("button", { name: "Remove" }).click();
  await expect(
    page.getByText("No account is open on this device."),
  ).toBeVisible();
  await expect(accounts.getByRole("listitem")).toHaveCount(1);
  await expect(accounts).toContainText("Account 2");

  // The removed account's OwnerId names its database, so with the relay down,
  // restoring it opens empty only because the removal deleted the database on
  // this device. The default name skips the one in use.
  await relay.stop();
  browserEvents.acceptNextDialog(restorePrompt, firstMnemonic);
  browserEvents.acceptNextPrompt(namePrompt, "Account 3");
  await page.getByRole("button", { name: "Restore Account" }).click();
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await expect(accounts.getByRole("listitem")).toHaveCount(2);
  await expect(openAccount).toContainText("Account 3");

  // Its data syncs back from the relay.
  await relay.start();
  await expect(
    page.getByRole("heading", { name: "First account's project" }),
  ).toBeVisible(afterRestart);

  // Restoring an account already on this device offers to keep its name.
  browserEvents.acceptNextDialog(restorePrompt, firstMnemonic);
  browserEvents.acceptNextPrompt(namePrompt, "Account 3");
  await page.getByRole("button", { name: "Restore Account" }).click();
  await expect(accounts.getByRole("listitem")).toHaveCount(2);
  await expect(openAccount).toContainText("Account 3");
});

test("deletes the database in every tab without a reload, after which both tabs continue", async ({
  browserEvents,
  context,
  page,
  relay,
}) => {
  // Without the relay, nothing syncs the data back.
  await relay.stop();
  await addProject(browserEvents, page, "Unsynced project");
  const otherPage = await context.newPage();
  await otherPage.goto("/playgrounds/full/instant");
  await expect(
    otherPage.getByRole("heading", { name: "Unsynced project" }),
  ).toBeVisible();
  // A reload would clear these, and it would also show as a load event.
  const loads: Array<Page> = [];
  for (const tab of [page, otherPage]) {
    await tab.evaluate(() => {
      (window as unknown as { notReloaded: boolean }).notReloaded = true;
    });
    tab.on("load", () => loads.push(tab));
  }

  // The AppOwner opens its database again, empty, in every tab.
  browserEvents.acceptNextDialog(
    "Delete this account's database on this device? What synced comes back from the relays; changes that haven't synced yet are lost.",
  );
  await page
    .getByRole("button", { name: "Delete Database", exact: true })
    .click();
  for (const tab of [page, otherPage])
    await expect(
      tab.getByRole("heading", { name: "No projects yet" }),
    ).toBeVisible();

  await addProject(browserEvents, otherPage, "After deletion");
  await expect(
    page.getByRole("heading", { name: "After deletion" }),
  ).toBeVisible();
  for (const tab of [page, otherPage])
    expect(
      await tab.evaluate(
        () => (window as unknown as { notReloaded?: boolean }).notReloaded,
      ),
    ).toBe(true);
  expect(loads).toEqual([]);
});

test("downloads a plaintext copy of the open account's database", async ({
  browserEvents,
  browserName,
  page,
}) => {
  const accounts = page.getByRole("region", { name: "Accounts" });
  const unknownAdvice = accounts.getByText(
    "This browser stores your data, but it may delete it",
  );
  // Chromium keeps the data until the user grants persistence, which tests
  // don't, so it may delete it.
  if (browserName === "chromium") await expect(unknownAdvice).toBeVisible();

  await addProject(browserEvents, page, "Exported project");
  const downloadPromise = page.waitForEvent("download");
  await accounts.getByRole("button", { name: "Download Database" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.sqlite3$/u);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\0");
  // The open account's database, not the device database or another one's.
  expect(bytes.includes("Exported project")).toBe(true);
});

// The playground's extra: relays the user adds while the account stays open on
// the page, each synced through a registration of its own beside the config's
// relay.

test("validates relay URLs, adds a backup relay, and removes it", async ({
  backupRelay,
  page,
  relay,
}) => {
  const section = page.getByRole("region", { name: "Relays" });
  const relays = section.getByRole("list", { name: "Relays", exact: true });
  const input = section.getByRole("textbox", { name: "Relay URL" });
  const error = section.getByRole("alert");
  await expect(section).toContainText("1 of 1 relay up to date");
  await expect(relays).toContainText("From the app's config.");

  await input.fill("https://not-a-relay.example");
  await input.press("Enter");
  await expect(error).toHaveText(
    "Use a ws:// or wss:// relay URL with a valid host name and path, without credentials, a query, or a fragment.",
  );
  await input.fill(relay.url);
  await input.press("Enter");
  await expect(error).toHaveText("This relay is already added.");
  await expect(relays.getByRole("listitem")).toHaveCount(1);

  // Without its trailing slash, as a user types it; the canonical URL is one
  // relay.
  await addRelay(page, backupRelay.url.slice(0, -1));
  await expect(error).toHaveCount(0);
  await expect(relays.getByRole("listitem")).toHaveCount(2);
  await expect(section).toContainText("2 of 2 relays up to date");

  await relays
    .getByRole("button", { name: `Remove ${backupRelay.url}`, exact: true })
    .click();
  await expect(relays.getByRole("listitem")).toHaveCount(1);
  await expect(section).toContainText("1 of 1 relay up to date");
});

test("keeps another browser's relays out of this browser's list", async ({
  backupRelay,
  browserEvents,
  page,
}) => {
  const section = page.getByRole("region", { name: "Relays" });
  await expect(section).toContainText("1 of 1 relay up to date");
  // Another browser syncs the same account, restored from its mnemonic, and
  // owns its relay registrations.
  const otherPage = await openAccountInNewContext(browserEvents, page);
  await addRelay(otherPage, backupRelay.url);
  await expect(otherPage.getByRole("region", { name: "Relays" })).toContainText(
    "2 of 2 relays up to date",
  );
  // A change made after the second relay is ready reaches the first browser
  // through their common relay before its relay list is checked.
  await addProject(browserEvents, otherPage, "Added in the other browser");
  await expect(
    page.getByRole("heading", { name: "Added in the other browser" }),
  ).toBeVisible();

  const relays = section.getByRole("list", { name: "Relays", exact: true });
  await expect(relays.getByRole("listitem")).toHaveCount(1);
  await expect(
    relays.getByRole("listitem").filter({ hasText: backupRelay.url }),
  ).toHaveCount(0);
});

test("keeps syncing through a backup relay and catches up the restarted primary", async ({
  backupRelay,
  browserEvents,
  page,
  relay,
}) => {
  test.slow();
  const section = page.getByRole("region", { name: "Relays" });
  await addRelay(page, backupRelay.url);
  await expect(section).toContainText("2 of 2 relays up to date");

  await relay.stop();
  await expect(section).toContainText("1 of 2 relays connected");
  await addProject(browserEvents, page, "Written while the primary was down");

  // An independent database can recover from the backup alone while the
  // primary is stopped. This proves delivery, beyond the connection badge.
  const backupReader = await openAccountInNewContext(browserEvents, page);
  await addRelay(backupReader, backupRelay.url);
  await expect(
    backupReader.getByRole("heading", {
      name: "Written while the primary was down",
    }),
  ).toBeVisible();
  await backupReader.context().close();

  await relay.start();
  await expect(section).toContainText("2 of 2 relays up to date", afterRestart);
  await backupRelay.stop();
  await expect(section).toContainText("1 of 2 relays connected");

  // The new database uses only the config's relay. The restored project
  // proves that relay caught up after reopening, with no backup available.
  const restored = await openAccountInNewContext(browserEvents, page);
  await expect(
    restored.getByRole("heading", {
      name: "Written while the primary was down",
    }),
  ).toBeVisible();
  await expect(restored.getByRole("region", { name: "Relays" })).toContainText(
    "1 of 1 relay up to date",
  );
});

// Submits with Enter: the relay list above the form grows as the shared worker
// reports each relay, which can move a button away from a click in flight.
const addRelay = async (page: Page, url: string): Promise<void> => {
  const input = page.getByRole("textbox", { name: "Relay URL", exact: true });
  await input.fill(url);
  await input.press("Enter");
  await expect(input).toHaveValue("");
};

/**
 * Opens the playground in a new context, as another browser, and restores the
 * account `page` has open from its mnemonic there, as a user syncs a second
 * device. The relay is the only path between the two.
 */
const openAccountInNewContext = async (
  browserEvents: BrowserEvents,
  page: Page,
): Promise<Page> => {
  const mnemonic = await readMnemonic(page);
  const context = await browserEvents.newContext();
  const otherPage = await context.newPage();
  await openPlayground(otherPage);
  await restoreMnemonic(browserEvents, otherPage, mnemonic);
  return otherPage;
};
