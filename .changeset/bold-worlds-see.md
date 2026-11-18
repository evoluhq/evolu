---
"@evolu/common": minor
"@evolu/web": minor
"@evolu/react-native": minor
---

Migrated Evolu 7 databases automatically

Evolu 8 stores data differently than Evolu 7, and an app updated to Evolu 8 started empty while its Evolu 7 database stayed on the device unused. Now an app updated from Evolu 7 moves that database into Evolu 8 the first time it starts and then deletes it, on the web and on React Native. `createEvoluApp` with instant start and `createFirstAppOwner: true` starts with the Evolu 7 owner as its first AppOwner, with the same mnemonic and its data, and `createEvolu` imports the Evolu 7 database of the AppOwner it gets.

Evolu 7 named its database by the `name` option of its config, which Evolu 8 renamed to `appName`, so Evolu looks for the Evolu 7 database under `appName`. When the two differ, pass Evolu 7's `name` as `evolu7Name`:

```ts
import {
  AppName,
  assertNotNull,
  createEvoluApp,
  id,
  Name,
  NonEmptyTrimmedString100,
} from "@evolu/common";
import { createEvoluDeps, createRun } from "@evolu/web";

const Schema = { todo: { id: id("Todo"), title: NonEmptyTrimmedString100 } };

const run = createRun(createEvoluDeps());
const app = await run.orThrow(
  createEvoluApp(Schema, {
    appName: AppName.orThrow("your-app-name"),
    auth: { type: "InstantStart" },
    createFirstAppOwner: true,
    evolu7Name: Name.orThrow("your-evolu-7-name"),
  }),
);

assertNotNull(app.current.get());
await app[Symbol.asyncDispose]();
```

Read [Upgrading from Evolu 7](https://www.evolu.dev/docs/upgrading#evolu-7-to-evolu-8) before you release the update.

Custom platform integrations: `DbWorkerDeps` takes an optional `evolu7DatabaseExists`, an `Evolu7DatabaseExists` that tells whether an Evolu 7 database exists without creating it, and migrates nothing without it. `@evolu/web` exports its `createEvolu7DatabaseExists`.
