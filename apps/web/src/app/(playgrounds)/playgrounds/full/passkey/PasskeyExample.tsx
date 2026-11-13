"use client";

import { AppName, createOwnerSecret, type EvoluAppAuth } from "@evolu/common";
import { createPasskeyAuth, type PasskeyAuthError } from "@evolu/web";
import { use, useState, useSyncExternalStore, type FC } from "react";
import {
  addAppOwner,
  AppView,
  Button,
  createApp,
  ExampleShell,
  restoreAppOwner,
  run,
  type App,
} from "../EvoluFullExample";

const appName = AppName.orThrow("full-passkey-example");

// The first use offers to create or restore an AppOwner and creates the
// passkey then, so the device database creates no AppOwner of its own.
const startApp = (auth: EvoluAppAuth) =>
  createApp({ appName, auth, createFirstAppOwner: false });

// Where the browser keeps nothing, as in Safari's Private Browsing or a Firefox
// private window, the app starts at once, without a passkey, in memory.
const startPromise = run
  .orThrow(
    createPasskeyAuth({
      appName,
      rpName: "Evolu Playground",
      userName: "Evolu Playground",
    }),
  )
  .then((auth) => ({
    auth,
    inMemoryApp:
      auth.state.get().type === "NotPersisted"
        ? startApp({ type: "InstantStart" })
        : null,
  }));

export const PasskeyExample: FC = () => (
  <ExampleShell
    intro={
      <p>
        The full Evolu app with a passkey: projects and todos, several accounts,
        relays, and local data. The passkey unlocks the accounts on this device,
        which protects their data there against malware, so each start asks for
        it, except where the browser keeps nothing, as in Safari&apos;s Private
        Browsing or a Firefox private window. The{" "}
        <a href="/playgrounds/full/instant" className="underline">
          variant without a passkey
        </a>{" "}
        starts without asking.
      </p>
    }
  >
    <Unlock />
  </ExampleShell>
);

/**
 * Unlocks the device database with a passkey in a click, because some browsers
 * allow a passkey prompt only in a user gesture, then renders the app. Errors
 * keep this screen usable, so the user can try again.
 */
const Unlock: FC = () => {
  const { auth, inMemoryApp } = use(startPromise);
  const state = useSyncExternalStore(
    auth.state.subscribe,
    auth.state.get,
    auth.state.get,
  );
  // What the button the user clicked asked for, which Try Again repeats.
  const [action, setAction] = useState<UnlockAction>("Unlock");
  const [started, setStarted] = useState<Promise<App> | null>(inMemoryApp);

  if (started)
    return (
      <>
        {/* The app runs in memory exactly while the browser keeps nothing. */}
        {state.type === "NotPersisted" && (
          <p className="mb-4 text-sm text-gray-600">
            This browser keeps nothing here, as in private browsing, so no
            passkey protects your accounts, and they last only until you close
            this tab.
          </p>
        )}
        <AppView app={started} />
      </>
    );

  const unlock = (nextAction: UnlockAction) => {
    setAction(nextAction);
    void auth.unlock().then(() => {
      const unlocked = auth.state.get();
      if (unlocked.type !== "Unlocked") return;
      const app = startApp({ type: "DeviceSecret", secret: unlocked.secret });
      // The app renders once the new AppOwner is open, so the screen without
      // one doesn't flash. A cancelled restore leaves none open, and that
      // screen offers it again.
      setStarted(
        nextAction === "Unlock"
          ? app
          : app.then(async (app) => {
              // Another tab may have created an AppOwner meanwhile. Adding one
              // more only asks for its name, which the user can cancel.
              if (nextAction === "Create")
                await addAppOwner(app, createOwnerSecret(run.deps));
              else await restoreAppOwner(app);
              return app;
            }),
      );
    });
  };

  if (
    state.type === "NotPersisted" ||
    state.type === "Unlocking" ||
    state.type === "Unlocked"
  )
    return (
      <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <p className="text-sm text-gray-600">Unlocking…</p>
      </div>
    );

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <p className="mb-4 text-sm text-gray-600">
        {state.hasDeviceSecret
          ? "Unlock your accounts on this device with your passkey."
          : "Create an account, or restore one from its mnemonic. A passkey then keeps your accounts on this device."}
      </p>
      {state.type === "Failed" && (
        <p role="alert" className="mb-4 text-sm text-red-800">
          {unlockErrorToMessage(state.error)}
          {state.startedOver &&
            (state.canStartOver
              ? " It still fails after starting over, so this passkey provider likely can't unlock. Start over to try another one."
              : " It still fails after starting over, so this passkey provider likely can't unlock. Try another one.")}
        </p>
      )}
      {state.type === "StartingOver" ? (
        <p className="text-sm text-gray-600">Starting over…</p>
      ) : state.type === "Failed" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            title="Try Again"
            variant="primary"
            onClick={() => {
              // With a secret stored, as after a declined start over, it only
              // unlocks rather than adding an account too.
              unlock(state.hasDeviceSecret ? "Unlock" : action);
            }}
          />
          {state.canStartOver && (
            <Button
              title="Start Over"
              onClick={() => {
                void auth.startOver({
                  confirm: () =>
                    confirm(
                      "Start over? The accounts on this device come back only from their mnemonics.",
                    ),
                });
              }}
            />
          )}
        </div>
      ) : state.hasDeviceSecret ? (
        <Button
          title="Unlock"
          variant="primary"
          onClick={() => {
            unlock("Unlock");
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            title="Create Account"
            variant="primary"
            onClick={() => {
              unlock("Create");
            }}
          />
          <Button
            title="Restore Account"
            onClick={() => {
              unlock("Restore");
            }}
          />
        </div>
      )}
    </div>
  );
};

/**
 * What the click that unlocks does next: only unlock, or on the first use, also
 * create or restore the first AppOwner.
 */
type UnlockAction = "Unlock" | "Create" | "Restore";

const unlockErrorToMessage = (error: PasskeyAuthError): string => {
  switch (error.type) {
    case "DeviceSecretKeyRefused":
      return "The passkey prompt was dismissed, or the passkey is gone. Try again.";
    case "DeviceSecretKeyUnavailable":
      return "This passkey provider doesn't support the WebAuthn PRF extension. Try another one.";
    case "DeviceSecretUnwrapError":
      return "The passkey doesn't unlock the stored secret.";
    case "UnknownError":
      return "Unlocking failed. See the console for details.";
  }
};
