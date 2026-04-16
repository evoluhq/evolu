# AppOwner UX and LocalAuth

## Goal

Rethink account onboarding around externally provided `AppOwner`.

The app should default to a disposable local-first experience. A visitor opens the app, gets a random local account, and can start using it immediately without sign-up, sync setup, or backup setup. Data stays encrypted on-device, so abandoned trial usage does not leak meaningful user data.

If the visitor finds the app useful, the app can later guide them to back up their mnemonic and opt into sync and backup.

## Core Idea

`AppOwner` will be provided externally instead of being managed internally by Evolu.

That changes the onboarding model:

- First visit creates a random `AppOwner` and therefore a random encrypted SQLite file.
- The app does not sync by default.
- The app stores only enough local state to know that this visitor has already been here.
- Sync and backup start only after the user explicitly accepts the mnemonic backup flow.
- After backup is accepted, the app persists the mnemonic via a platform-specific secure storage wrapper.

This matches the intended UX described in [packages/common/src/local-first/Evolu.ts](packages/common/src/local-first/Evolu.ts#L97): let users try a ready-to-use app first, then prompt backup of `evolu.appOwner` only after they see value.

## Minimal Example UX

The minimal example in [apps/web/src/app/(playgrounds)/playgrounds/minimal/EvoluMinimalExample.tsx](<apps/web/src/app/(playgrounds)/playgrounds/minimal/EvoluMinimalExample.tsx>) should demonstrate this flow first.

Desired behavior:

- The example should not sync by default.
- A new visitor gets an ephemeral random local account.
- The example should remember locally that the visitor already used the app before.
- The UI should encourage backup only after the visitor starts entering data or otherwise shows intent.
- If the visitor accepts backup, the app stores the mnemonic using a secure-storage abstraction.
- Once backup is enabled, code should use the instance `appOwner` via `evolu.useOwner(...)` so sync and backup start intentionally, not automatically.

This means the current example behavior is backwards for the target UX because it currently hard-codes a stable owner and configures transport up front.

## Why Sync Should Be Opt-In

Visitors opening an example app usually want to try the app, not evaluate sync and backup on first load.

Default sync creates unnecessary friction:

- It asks the user to care about account concepts before they care about the app.
- It makes backup feel mandatory instead of useful.
- It couples first-run UX to transport configuration.
- It undermines the disposable trial experience.

The better sequence is:

1. Create a local encrypted account automatically.
2. Let the visitor use the app immediately.
3. Observe intent, such as entering data.
4. Encourage mnemonic backup.
5. Persist the mnemonic only after user consent.
6. Start sync only after backup is enabled.

## LocalAuth

This design requires a platform-agnostic local auth wrapper.

The wrapper is responsible for storing and retrieving app-local identity state, not for generating Evolu data model objects by itself.

Initial purpose:

- Remember that a visitor has already been here.
- Store the mnemonic when the visitor accepts backup.
- Support future restore flows.

The old LocalAuth code was commented out or removed because the implementation quality was poor, but the underlying idea was correct.

## Platform Storage Strategy

### React Native / Expo

Expo is the simplest case because secure storage already exists:

- Use `expo-secure-store`.
- Wrap it behind a platform-agnostic LocalAuth interface.

Reference: https://docs.expo.dev/versions/latest/sdk/securestore/

### Web

For the web, start simple:

- Use `localStorage` for now.
- Keep the API shaped so it can later evolve to better browser-backed storage.

The web implementation is not meant to be the final security story. It is a first platform implementation behind the same abstraction.

## LocalAuth Data Model

The exact interface can be designed later, but the UX implies at least these states:

- Visitor has never used this app on this device.
- Visitor has used this app before.
- Visitor accepted mnemonic backup and the mnemonic is stored locally.
- Visitor chose a paranoid mode where the mnemonic is not stored locally.
- Visitor stored only a petname that helps identify the account later.

The important distinction is between:

- Presence marker: enough local state to avoid treating every visit as a first visit.
- Stored mnemonic: enough local state to restore the same `AppOwner` automatically.
- Petname-only mode: enough local state to show recognition without storing the mnemonic.

## Backup UX

When the user enters data, the app should encourage mnemonic backup.

If the user agrees:

- Persist the mnemonic through LocalAuth.
- Treat the current `appOwner` as a durable account for this device.
- Enable sync intentionally by calling `evolu.useOwner(...)` with the instance owner and chosen transports.

If the user declines:

- Continue working locally.
- Keep the account effectively disposable.
- Continue nudging carefully when the product decides it is appropriate.

## Paranoid User Mode

Some users will not want the mnemonic stored on-device, even in secure storage.

For those users:

- Do not store the mnemonic locally.
- Store only a petname or similar local label.
- On the next visit, ask for the mnemonic.

This keeps the UX compatible with privacy-sensitive users while still giving the app a way to recognize that the visitor has been here before.

## Evolu API Direction Implied by This UX

This UX suggests a few API constraints:

- Evolu should not assume ownership of long-term `AppOwner` persistence.
- Sync should be activatable later for the existing instance owner.
- Backup and restore should integrate with externally managed local auth state.
- Example apps should model explicit opt-in sync rather than automatic sync.

In practice, this means the instance `appOwner` exists first, and sync is layered on later with `evolu.useOwner(...)`.

## Out of Scope for This Note

This note does not yet define the final reset and restore APIs.

Those features need to be redesigned after the externally provided `AppOwner` and LocalAuth model is settled, because reset and restore semantics now depend on who owns mnemonic persistence and how instance identity is recreated.

## Open Questions

- What exact event should trigger the backup prompt in the example: first mutation, first non-empty dataset, or a more deliberate milestone?
- What should the LocalAuth interface look like across web and native?
- Should `evolu.useOwner(...)` be called immediately after backup acceptance, or only after the mnemonic is successfully persisted?
- What petname UX is good enough for the first iteration?
- What local marker should represent "visitor has been here" before mnemonic backup is enabled?
