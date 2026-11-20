import { expect, type Page } from "playwright/test";
import {
  addProject,
  namePrompt,
  readMnemonic,
  restorePrompt,
  test,
} from "./fixtures.mts";

// The passkey variant of the full playground. Its components are the instant
// start variant's, which EvoluFullExample.spec.mts covers in every browser.
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "Playwright exposes CDP, which adds a virtual authenticator, only for Chromium.",
);

/**
 * A page's URL on `localhost`: WebAuthn accepts no IP address as a relying
 * party ID, and `localhost`, like the server's 127.0.0.1, is a secure context.
 */
const localhostUrl = (path: string, baseURL: string | undefined): string => {
  const url = new URL(path, baseURL);
  url.hostname = "localhost";
  return url.href;
};

const passkeyUrl = (baseURL: string | undefined): string =>
  localhostUrl("/playgrounds/full/passkey", baseURL);

/** A platform authenticator with user verification, as a phone or laptop has. */
const addVirtualAuthenticator = async (
  page: Page,
  { hasPrf = true, isUserVerified = true } = {},
) => {
  const session = await page.context().newCDPSession(page);
  await session.send("WebAuthn.enable");
  const { authenticatorId } = await session.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified,
        hasPrf,
        automaticPresenceSimulation: true,
      },
    },
  );
  return { session, authenticatorId };
};

test("creates a passkey with the first account and unlocks it on the next start", async ({
  baseURL,
  browserEvents,
  page,
}) => {
  await addVirtualAuthenticator(page);
  await page.goto(passkeyUrl(baseURL));
  // The first use offers to create or restore an account, and no unlock.
  await expect(page.getByRole("button", { name: "Unlock" })).toHaveCount(0);
  // The name prompt follows the passkey's, outside the click.
  browserEvents.acceptNextPrompt(namePrompt, "Account 1");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  const accounts = page.getByRole("list", { name: "Accounts on this device" });
  await expect(accounts.getByRole("listitem")).toHaveCount(1);
  await expect(accounts).toContainText("Account 1 (open)");
  await addProject(browserEvents, page, "Behind the passkey");

  await page.reload();
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(
    page.getByRole("heading", { name: "Behind the passkey" }),
  ).toBeVisible();
  await expect(accounts.getByRole("listitem")).toHaveCount(1);
});

test("shows the unlocked app again when the page comes back without a reload", async ({
  baseURL,
  browserEvents,
  page,
}) => {
  await addVirtualAuthenticator(page);
  // Links between the docs and the playgrounds navigate in the client, which
  // keeps the playground's module, with its unlocked passkey, while its
  // components unmount and mount again.
  await page.goto(localhostUrl("/docs/local-auth", baseURL));
  await page
    .getByRole("link", { name: "passkey playground", exact: true })
    .click();
  browserEvents.acceptNextPrompt(namePrompt, "Account 1");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Local auth" })).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
});

test("restores an account from its mnemonic on the first use", async ({
  baseURL,
  browserEvents,
  context,
  page,
}) => {
  // The instant start variant on 127.0.0.1, another origin with storage of its
  // own, syncs the account's data to the relay.
  await page.goto("/playgrounds/full/instant");
  await addProject(browserEvents, page, "Restored project");
  const mnemonic = await readMnemonic(page);

  const passkeyPage = await context.newPage();
  await addVirtualAuthenticator(passkeyPage);
  await passkeyPage.goto(passkeyUrl(baseURL));
  browserEvents.acceptNextDialog(restorePrompt, mnemonic);
  browserEvents.acceptNextDialog(namePrompt);
  await passkeyPage.getByRole("button", { name: "Restore Account" }).click();
  await expect(
    passkeyPage.getByRole("heading", { name: "Restored project" }),
  ).toBeVisible();
  expect(await readMnemonic(passkeyPage)).toBe(mnemonic);
});

test("starts over once the user confirms, after the passkey is gone", async ({
  baseURL,
  browserEvents,
  page,
}) => {
  const { session, authenticatorId } = await addVirtualAuthenticator(page);
  await page.goto(passkeyUrl(baseURL));
  browserEvents.acceptNextDialog(namePrompt);
  await page.getByRole("button", { name: "Create Account" }).click();
  await addProject(browserEvents, page, "Back from the mnemonic");
  const mnemonic = await readMnemonic(page);

  // WebAuthn reports a deleted passkey like a dismissed prompt, so the unlock
  // screen stays usable and, with a stored secret, offers to start over.
  await session.send("WebAuthn.clearCredentials", { authenticatorId });
  await page.reload();
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/u })).toHaveText(
    "The passkey prompt was dismissed, or the passkey is gone. Try again.",
  );
  await page.getByRole("button", { name: "Try Again" }).click();
  await expect(page.getByRole("button", { name: "Try Again" })).toBeVisible();

  browserEvents.acceptNextDialog(
    "Start over? The accounts on this device come back only from their mnemonics.",
  );
  await page.getByRole("button", { name: "Start Over" }).click();
  // Starting over is a first use again. Restoring the account from its
  // mnemonic reopens its database, which stayed on this device, so its data is
  // back without waiting for a relay.
  browserEvents.acceptNextDialog(restorePrompt, mnemonic);
  browserEvents.acceptNextDialog(namePrompt);
  await page.getByRole("button", { name: "Restore Account" }).click();
  await expect(
    page.getByRole("heading", { name: "Back from the mnemonic" }),
  ).toBeVisible();
});

test("keeps everything when the user declines to start over", async ({
  baseURL,
  browserEvents,
  page,
}) => {
  const { session, authenticatorId } = await addVirtualAuthenticator(page);
  await page.goto(passkeyUrl(baseURL));
  browserEvents.acceptNextDialog(namePrompt);
  await page.getByRole("button", { name: "Create Account" }).click();
  await addProject(browserEvents, page, "Kept project");

  await session.send("WebAuthn.clearCredentials", { authenticatorId });
  await page.reload();
  await page.getByRole("button", { name: "Unlock" }).click();
  browserEvents.dismissNextDialog(
    "Start over? The accounts on this device come back only from their mnemonics.",
  );
  await page.getByRole("button", { name: "Start Over" }).click();
  await expect(page.getByRole("button", { name: "Try Again" })).toBeVisible();

  // The stored secret stays, so the next start still asks to unlock it.
  await page.reload();
  await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Account" }),
  ).toHaveCount(0);
});

test("keeps offering Start Over while only a pending passkey is involved", async ({
  baseURL,
  page,
}) => {
  // The provider creates passkeys but refuses every prompt for one, so each
  // setup stops with a pending key, and unlocking asks for that passkey only.
  await addVirtualAuthenticator(page);
  await page.addInitScript(() => {
    navigator.credentials.get = () =>
      Promise.reject(new DOMException("Refused", "NotAllowedError"));
  });
  await page.goto(passkeyUrl(baseURL));
  const alert = page.getByRole("alert").filter({ hasText: /\S/u });
  for (const attempt of [1, 2]) {
    await page.getByRole("button", { name: "Create Account" }).click();
    // A new passkey's first refusal isn't a failed retry. Without a stored
    // secret, the choices are the retry.
    await page.getByRole("button", { name: "Create Account" }).click();
    if (attempt === 2)
      await expect(alert).toContainText(
        "It still fails after starting over, so this passkey provider likely can't unlock. Start over to try another one.",
      );
    // Forgetting a pending key loses nothing, so it asks for no confirmation.
    await page.getByRole("button", { name: "Start Over" }).click();
    await expect(alert).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Create Account" }),
    ).toBeVisible();
  }
});

test("tells when the passkey provider lacks the PRF extension", async ({
  baseURL,
  page,
}) => {
  await addVirtualAuthenticator(page, { hasPrf: false });
  await page.goto(passkeyUrl(baseURL));
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/u })).toHaveText(
    "This passkey provider doesn't support the WebAuthn PRF extension. Try another one.",
  );
  await expect(page.getByRole("button", { name: "Start Over" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try Again" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create Account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restore Account" }),
  ).toBeVisible();
});

test("offers both choices again after the user dismisses the passkey prompt of Restore Account", async ({
  baseURL,
  browserEvents,
  page,
}) => {
  await addVirtualAuthenticator(page);
  // The user dismisses the first passkey prompt, as one who changed their mind.
  await page.addInitScript(() => {
    const create = navigator.credentials.create.bind(navigator.credentials);
    let dismissed = false;
    navigator.credentials.create = (options) => {
      if (dismissed) return create(options);
      dismissed = true;
      return Promise.reject(new DOMException("Dismissed", "NotAllowedError"));
    };
  });
  await page.goto(passkeyUrl(baseURL));
  await page.getByRole("button", { name: "Restore Account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/u })).toHaveText(
    "The passkey prompt was dismissed or refused. Try again.",
  );
  // A dismissed prompt leaves no key, so there's nothing to start over.
  await expect(page.getByRole("button", { name: "Start Over" })).toHaveCount(0);

  browserEvents.acceptNextPrompt(namePrompt, "Account 1");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Accounts on this device" }),
  ).toContainText("Account 1 (open)");
});
