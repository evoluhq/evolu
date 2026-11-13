"use client";

import { AppName } from "@evolu/common";
import type { FC } from "react";
import { AppView, createApp, ExampleShell } from "../EvoluFullExample";

// Instant start needs no prompt, but the key of the device database, which
// keeps the AppOwners' secrets, is public. The app starts with an AppOwner,
// which the user can remove from the list, so a first visit shows the app
// right away.
const appPromise = createApp({
  appName: AppName.orThrow("full-example"),
  auth: { type: "InstantStart" },
  createFirstAppOwner: true,
});

export const InstantStartExample: FC = () => (
  <ExampleShell
    intro={
      <p>
        The full Evolu app: projects and todos, several accounts you can switch,
        restore and remove, relays, and local data. It starts at once with one
        account and no passkey. Without a passkey, its data on this device
        isn&apos;t protected against malware, so it doesn&apos;t suit sensitive
        data. The{" "}
        <a href="/playgrounds/full/passkey" className="underline">
          passkey variant
        </a>{" "}
        protects it.
      </p>
    }
  >
    <AppView app={appPromise} />
  </ExampleShell>
);
