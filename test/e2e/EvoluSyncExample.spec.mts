import { expect, type Locator, type Page } from "playwright/test";
import { addTodo, afterRestart, test } from "./fixtures.mts";

test("shows connection and synchronization state while editing items", async ({
  page,
  relay,
}) => {
  test.slow();
  await relay.stop();
  await page.goto("/playgrounds/sync");
  await expect(
    page.getByRole("heading", { name: "Sync playground" }),
  ).toBeVisible();
  const status = page
    .getByRole("region", { name: "Synchronization", exact: true })
    .getByRole("status");
  const relays = page.getByRole("region", { name: "Relays", exact: true });
  await expect(status).toHaveText("Disconnected");
  // A failed first connection stays disconnected while it reconnects.
  await expect(relays.getByText("Disconnected", { exact: true })).toBeVisible();

  await relay.start();
  await expect(status).toHaveText("Synced", afterRestart);
  await expect(relays.getByText("Connected", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add", exact: true }).click();
  const validationError = page
    .getByRole("region", { name: "Shared list", exact: true })
    .getByRole("alert");
  await expect(validationError).toHaveText(
    "Enter an item with 1–100 characters.",
  );
  await expect(
    page
      .getByRole("list", { name: "Items", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(0);

  await addItem(page, "  First item  ");
  await expect(validationError).toHaveCount(0);
  const item = page.getByRole("checkbox", { name: "First item", exact: true });
  await expect(item).not.toBeChecked();
  await item.click();
  await expect(item).toBeChecked();

  await page
    .getByRole("button", { name: "Delete First item", exact: true })
    .click();
  await expect(
    page
      .getByRole("list", { name: "Items", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(0);
});

test("recovers automatically after disconnect and restores items through the relay", async ({
  browserEvents,
  page,
  relay,
}) => {
  test.slow();
  await page.goto("/playgrounds/sync");
  const status = page
    .getByRole("region", { name: "Synchronization", exact: true })
    .getByRole("status");
  await expect(status).toHaveText("Synced");
  await addItem(page, "Before disconnect");

  await relay.stop();
  // Losing the connection disconnects sync; it is not a failed sync result.
  await expect(status).toHaveText("Disconnected");
  await addItem(page, "Written while disconnected");
  const firstItem = page.getByRole("checkbox", {
    name: "Before disconnect",
    exact: true,
  });
  await firstItem.click();
  await expect(firstItem).toBeChecked();
  await expect(status).toHaveText("Disconnected");

  await relay.start();
  await expect(status).toHaveText("Synced", afterRestart);
  await expect(
    page
      .getByRole("region", { name: "Relays", exact: true })
      .getByText("Connected", { exact: true }),
  ).toBeVisible();

  // A separate context starts with an empty in-memory database and cannot
  // share the original context's worker. Its only recovery path is the relay.
  const restoredContext = await browserEvents.newContext();
  const restored = await restoredContext.newPage();
  await restored.goto(page.url());
  await expect(
    restored.getByRole("checkbox", { name: "Before disconnect", exact: true }),
  ).toBeChecked();
  await expect(
    restored.getByRole("checkbox", {
      name: "Written while disconnected",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    restored
      .getByRole("region", { name: "Synchronization", exact: true })
      .getByRole("status"),
  ).toHaveText("Synced");

  await addItem(restored, "From the restored database");
  await expect(
    page.getByRole("checkbox", {
      name: "From the restored database",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("list", { name: "Items", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(3);
  await expect(firstItem).toBeChecked();
  await expect(status).toHaveText("Synced");
});

test("synchronizes deletes through the relay", async ({
  browserEvents,
  page,
}) => {
  await page.goto("/playgrounds/sync");
  await addItem(page, "Kept");
  await addItem(page, "Deleted");

  // Separate contexts cannot share a worker, so the delete travels through
  // the relay to a reader that has already received the item.
  const readerContext = await browserEvents.newContext();
  const reader = await readerContext.newPage();
  await reader.goto(page.url());
  const readerItems = reader
    .getByRole("list", { name: "Items", exact: true })
    .getByRole("listitem");
  const readerDeleted = reader.getByRole("checkbox", {
    name: "Deleted",
    exact: true,
  });
  await expect(readerDeleted).toBeVisible();
  await expect(readerItems).toHaveCount(2);

  await page
    .getByRole("button", { name: "Delete Deleted", exact: true })
    .click();
  await expect(readerDeleted).toHaveCount(0);
  await expect(readerItems).toHaveCount(1);

  // A fresh database has only the relay's history. Waiting for the kept item
  // ensures the absence of the deleted one is not an empty initial list.
  const freshContext = await browserEvents.newContext();
  const fresh = await freshContext.newPage();
  await fresh.goto(page.url());
  const freshItems = fresh
    .getByRole("list", { name: "Items", exact: true })
    .getByRole("listitem");
  await expect(
    fresh.getByRole("checkbox", { name: "Kept", exact: true }),
  ).toBeVisible();
  await expect(freshItems).toHaveCount(1);
});

test("validates relay URLs and removes configured relays", async ({
  backupRelay,
  page,
  relay,
}) => {
  await page.goto("/playgrounds/sync");
  const relays = page.getByRole("region", { name: "Relays", exact: true });
  const input = relays.getByRole("textbox", { name: "Relay URL", exact: true });
  const add = relays.getByRole("button", { name: "Add relay", exact: true });
  const error = relays.getByRole("alert");
  await expect(relays.getByRole("listitem")).toHaveCount(1);
  // Clicks land by position, so wait until the relay list above the form stops
  // growing as the worker reports the relay and its first round.
  await expect(
    page.getByText("1 of 1 relay up to date", { exact: true }),
  ).toBeVisible();

  await input.fill("https://not-a-relay.example");
  await add.click();
  await expect(error).toHaveText(
    "Use a ws:// or wss:// relay URL with a valid host name and path, without credentials, a query, or a fragment.",
  );
  await expect(relays.getByRole("listitem")).toHaveCount(1);

  await input.fill(relay.url);
  await add.click();
  await expect(error).toHaveText("This relay is already added.");
  await expect(relays.getByRole("listitem")).toHaveCount(1);

  await input.fill(backupRelay.url.slice(0, -1));
  await add.click();
  await expect(input).toHaveValue("");
  await expect(error).toHaveCount(0);
  await expect(relays.getByRole("listitem")).toHaveCount(2);
  await expect(
    page.getByText("2 of 2 relays up to date", { exact: true }),
  ).toBeVisible();

  await relays
    .getByRole("button", { name: `Remove ${backupRelay.url}`, exact: true })
    .click();
  await expect(relays.getByRole("listitem")).toHaveCount(1);
  await relays
    .getByRole("button", { name: `Remove ${relay.url}`, exact: true })
    .click();
  await expect(relays.getByRole("listitem")).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Synchronization", exact: true })
      .getByRole("status"),
  ).toHaveText("Local only");
});

test("keeps another memory tab's relays out of this tab's list", async ({
  backupRelay,
  context,
  page,
  relay,
}) => {
  await page.goto("/playgrounds/sync");
  await expect(
    page.getByText("1 of 1 relay up to date", { exact: true }),
  ).toBeVisible();
  // Each memory instance owns its worker and relay registrations, even in
  // another tab of the same browser context.
  const otherPage = await context.newPage();
  await otherPage.goto(page.url());
  const otherRelays = otherPage.getByRole("region", {
    name: "Relays",
    exact: true,
  });
  await addRelay(otherRelays, backupRelay.url);
  await expect(
    otherPage.getByText("2 of 2 relays up to date", { exact: true }),
  ).toBeVisible();
  // A change made after the second relay is ready reaches the first tab
  // through their common relay before its relay list is checked.
  await addItem(otherPage, "After adding a relay in the other tab");
  await expect(
    page.getByRole("checkbox", {
      name: "After adding a relay in the other tab",
      exact: true,
    }),
  ).toBeVisible();

  const relays = page.getByRole("region", { name: "Relays", exact: true });
  await expect(
    relays.getByRole("listitem").filter({ hasText: backupRelay.url }),
  ).toHaveCount(0);
  await expect(
    relays.getByRole("button", { name: `Remove ${relay.url}`, exact: true }),
  ).toBeVisible();

  await expect(relays.getByRole("listitem")).toHaveCount(1);
});

test("keeps the minimal playground's connection out of the sync playground's list", async ({
  context,
  page,
  relay,
}) => {
  await page.goto("/playgrounds/sync");
  const relays = page.getByRole("region", { name: "Relays", exact: true });
  await expect(
    page.getByText("1 of 1 relay connected", { exact: true }),
  ).toBeVisible();

  // The minimal playground uses the same owner and connects to the relay URL
  // without the OwnerId, so it opens a separate connection with the same label.
  const minimal = await context.newPage();
  await minimal.goto("/playgrounds/minimal");
  await addTodo(minimal, "From the minimal playground");
  // The todo arrives after the minimal playground registered its connection.
  await expect(
    page.getByRole("checkbox", {
      name: "From the minimal playground",
      exact: true,
    }),
  ).toBeVisible();

  const relayRows = relays.getByRole("listitem");
  await expect(relayRows).toHaveCount(1);
  await expect(relayRows).toContainText(relay.url);
  await expect(
    relays.getByRole("button", { name: `Remove ${relay.url}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 of 1 relay connected", { exact: true }),
  ).toBeVisible();
});

test("keeps syncing through a backup relay and catches up the restarted primary", async ({
  backupRelay,
  browserEvents,
  page,
  relay,
}) => {
  test.slow();
  await page.goto("/playgrounds/sync");
  await addRelay(page, backupRelay.url);
  await expect(
    page.getByText("2 of 2 relays up to date", { exact: true }),
  ).toBeVisible();

  await relay.stop();
  await expect(
    page.getByText("1 of 2 relays connected", { exact: true }),
  ).toBeVisible();
  await addItem(page, "Written while the primary was down");

  // An independent database can recover from the backup alone while the
  // primary is stopped. This proves delivery, beyond the connection badge.
  const backupContext = await browserEvents.newContext();
  const backupReader = await backupContext.newPage();
  await backupReader.goto(page.url());
  await addRelay(backupReader, backupRelay.url);
  await expect(
    backupReader.getByRole("checkbox", {
      name: "Written while the primary was down",
      exact: true,
    }),
  ).toBeVisible();
  await backupContext.close();

  await relay.start();
  await expect(
    page.getByText("2 of 2 relays up to date", { exact: true }),
  ).toBeVisible(afterRestart);
  await backupRelay.stop();
  await expect(
    page.getByText("1 of 2 relays connected", { exact: true }),
  ).toBeVisible();

  // The new context uses only the default primary. The restored item proves
  // that relay caught up after reopening, with no backup available to it.
  const restoredContext = await browserEvents.newContext();
  const restored = await restoredContext.newPage();
  await restored.goto(page.url());
  await expect(
    restored.getByRole("checkbox", {
      name: "Written while the primary was down",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    restored.getByText("1 of 1 relay up to date", { exact: true }),
  ).toBeVisible();
});

test("shows a relay's sync error until the relay accepts the write", async ({
  page,
  relay,
}) => {
  test.slow();
  await relay.stop();
  // A one-byte quota rejects every write.
  await relay.start({ EVOLU_RELAY_MAX_OWNER_BYTES: "1B" });
  await page.goto("/playgrounds/sync");
  const status = page
    .getByRole("region", { name: "Synchronization", exact: true })
    .getByRole("status");
  const relays = page.getByRole("region", { name: "Relays", exact: true });
  await expect(status).toHaveText("Synced");

  await addItem(page, "Over quota");
  await expect(status).toHaveText("Sync error");
  await expect(
    relays.getByText("Sync error: ProtocolQuotaError", { exact: true }),
  ).toBeVisible();

  await relay.stop();
  await relay.start();
  await expect(status).toHaveText("Synced", afterRestart);
  await expect(relays.getByText("Up to date", { exact: true })).toBeVisible();
});

// Submits with Enter rather than a click, because Playwright clicks by position
// and, while a page starts, the relay list above the form grows as the worker
// reports each relay, which can move the button away from a click in flight.
const addRelay = async (scope: Page | Locator, url: string): Promise<void> => {
  const input = scope.getByRole("textbox", { name: "Relay URL", exact: true });
  await input.fill(url);
  await input.press("Enter");
  await expect(input).toHaveValue("");
};

const addItem = async (page: Page, title: string): Promise<void> => {
  const input = page.getByRole("textbox", { name: "New item", exact: true });
  await input.fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(input).toHaveValue("");
};
