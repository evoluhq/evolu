/**
 * WebAuthn passkeys for {@link createEvoluApp}'s `DeviceSecret` auth on the web:
 * {@link createPasskeyAuth} unlocks the app's DeviceSecret with a passkey, and
 * {@link createPasskeyKeyProvider} is the {@link DeviceSecretKeyProvider} it
 * uses.
 *
 * Passkey providers and browsers support the WebAuthn PRF extension
 * differently: some give no PRF output when creating a passkey but do when
 * getting its key, some refuse every request for it, some give none at all, and
 * Safari with some security keys gives another output or none. [Passkeys &
 * WebAuthn PRF](https://www.corbado.com/blog/passkeys-prf-webauthn) lists them,
 * and the tests cover each case it describes.
 *
 * @module
 */

// A passkey's PRF output wraps the DeviceSecret on the web; see
// docs/adr/evolu-creates-and-stores-app-owners.md.

import {
  assert,
  constVoid,
  createStore,
  createUnknownError,
  DeviceSecretKeyId,
  disposable,
  Entropy32,
  eqUint8Array,
  err,
  forgetWrappedDeviceSecret,
  hasWrappedDeviceSecret,
  ok,
  promiseToTask,
  tryAsync,
  trySync,
  unlockWrappedDeviceSecret,
  type AppName,
  type createEvoluApp,
  type DeviceSecret,
  type DeviceSecretKeyError,
  type DeviceSecretKeyProvider,
  type DeviceSecretKeyRefusedError,
  type DeviceSecretUnwrapError,
  type ReadonlyStore,
  type Task,
  type Typed,
  type UnknownError,
} from "@evolu/common";
import type {
  EvoluPlatformDeps,
  StoredWorkerDep,
} from "@evolu/common/local-first";

/** Unlocks the app's DeviceSecret with a passkey; see {@link createPasskeyAuth}. */
export interface PasskeyAuth extends AsyncDisposable {
  /**
   * What the app shows: not persisted, locked, unlocking, failed, starting
   * over, or unlocked. A listener that throws doesn't stop an unlock or a start
   * over: the Run's `reportDefect` reports its error, and the state changes
   * anyway.
   */
  readonly state: ReadonlyStore<PasskeyAuthState>;

  /**
   * Unlocks the stored DeviceSecret with its passkey, or on the first use
   * creates a passkey and a DeviceSecret, and resolves once the state says how
   * it went. Call it in a user gesture, while the state is `Locked` or
   * `Failed`.
   */
  readonly unlock: () => Promise<void>;

  /**
   * Forgets the stored DeviceSecret or a setup's pending key, so the next
   * {@link PasskeyAuth.unlock} creates another passkey and DeviceSecret, and
   * resolves once the state says how it went. Call it while the state is
   * `Failed` with `canStartOver`. A pending key wrapped no secret, so it's
   * forgotten without asking; a stored secret is forgotten only once `confirm`,
   * such as the app's dialog, returns true, because its device database's
   * accounts then come back only from their backups. A `confirm` that throws or
   * rejects, as a dialog library can when the user dismisses it, declines: the
   * Run's `reportDefect` reports its error, and starting over stays offered.
   */
  readonly startOver: (options: {
    readonly confirm: () => boolean | Promise<boolean>;
  }) => Promise<void>;
}

/** The state of a {@link PasskeyAuth}. */
export type PasskeyAuthState =
  | NotPersistedPasskeyAuthState
  | LockedPasskeyAuthState
  | UnlockingPasskeyAuthState
  | FailedPasskeyAuthState
  | StartingOverPasskeyAuthState
  | UnlockedPasskeyAuthState;

/**
 * The browser keeps nothing, as in Safari's Private Browsing or a Firefox
 * private window, so every start would create another passkey. The app starts
 * without one, with `InstantStart`, in memory. It's final.
 */
export interface NotPersistedPasskeyAuthState extends Typed<"NotPersisted"> {}

/**
 * Nothing is unlocked yet. `hasDeviceSecret` tells whether a wrapped
 * DeviceSecret is stored, such as to label a button "Unlock" or "Create
 * account".
 */
export interface LockedPasskeyAuthState extends Typed<"Locked"> {
  readonly hasDeviceSecret: boolean;
}

/** An unlock is in progress, with its passkey prompts. */
export interface UnlockingPasskeyAuthState extends Typed<"Unlocking"> {
  readonly hasDeviceSecret: boolean;
}

/**
 * The last unlock failed. The user can try again, and when `canStartOver` is
 * true, the app can offer to start over. `startedOver` tells whether the user
 * started over before: an unlock that still fails then points to the passkey
 * provider, such as one that refuses PRF, so the app can suggest another one.
 */
export interface FailedPasskeyAuthState extends Typed<"Failed"> {
  readonly hasDeviceSecret: boolean;
  readonly error: PasskeyAuthError;
  readonly canStartOver: boolean;
  readonly startedOver: boolean;
}

/** A start over is in progress. */
export interface StartingOverPasskeyAuthState extends Typed<"StartingOver"> {
  readonly hasDeviceSecret: boolean;
}

/**
 * The DeviceSecret is unlocked, so pass it to {@link createEvoluApp} as `{ type:
 * "DeviceSecret", secret }`. It's final.
 */
export interface UnlockedPasskeyAuthState extends Typed<"Unlocked"> {
  readonly secret: DeviceSecret;
}

/** Why an unlock of a {@link PasskeyAuth} failed. */
export type PasskeyAuthError = DeviceSecretKeyError | DeviceSecretUnwrapError;

/**
 * Unlocks the app's {@link DeviceSecret} with a passkey, for
 * {@link createEvoluApp}'s `DeviceSecret` auth on the web, and decides when the
 * app can offer to start over. It reads, without a prompt, whether the browser
 * keeps anything and whether a wrapped DeviceSecret is stored, so the app can
 * label its first screen, such as "Unlock" or "Create account". Where the
 * browser keeps nothing, as in Safari's Private Browsing or a Firefox private
 * window, its state is `NotPersisted`, and the app starts without a passkey,
 * with `InstantStart`, in memory.
 *
 * Call {@link PasskeyAuth.unlock} in a user gesture, such as a button click,
 * because some browsers allow a passkey prompt only in one. The app shows its
 * own UI and error messages for each {@link PasskeyAuthState}, its own
 * confirmation before a start over loses the stored secret, and decides what
 * happens once it's `Unlocked`, such as creating or restoring an account. A
 * failure keeps the state usable, so the user can try again.
 *
 * Its state doesn't follow other tabs. A start over forgets only a pending key
 * without asking, under the lock setups take, so another tab's setup can't
 * store a secret in between. Disposing it aborts the unlock or start over in
 * progress.
 *
 * It uses {@link unlockWrappedDeviceSecret}, {@link hasWrappedDeviceSecret}, and
 * {@link forgetWrappedDeviceSecret} with {@link createPasskeyKeyProvider}.
 */
export const createPasskeyAuth =
  ({
    appName,
    ...providerOptions
  }: CreatePasskeyKeyProviderOptions & {
    /** The `appName` passed to {@link createEvoluApp}. */
    readonly appName: AppName;
  }): Task<PasskeyAuth, UnknownError, EvoluPlatformDeps & StoredWorkerDep> =>
  async (run) => {
    const keyProvider = createPasskeyKeyProvider(providerOptions);
    const devicePersistence = await run.ok(
      promiseToTask(() => run.deps.getDevicePersistence()),
    );
    let hasDeviceSecret = false;
    if (devicePersistence !== "NotPersisted") {
      const has = await run(hasWrappedDeviceSecret(appName));
      if (!has.ok) return has;
      hasDeviceSecret = has.value;
    }

    // Set once, by a start over that forgot what was stored or pending.
    let startedOver = false;

    await using disposer = new AsyncDisposableStack();
    const state = disposer.use(
      createStore<PasskeyAuthState>(
        devicePersistence === "NotPersisted"
          ? { type: "NotPersisted" }
          : { type: "Locked", hasDeviceSecret },
      ),
    );
    const actionRun = disposer.use(run.create());

    // An app's listener that throws stops neither the app nor an action: its
    // error is reported, and the state changes anyway, as a store sets its
    // value before it notifies. Also before an action's Task starts, which
    // would otherwise never run to move the state on.
    const setState = (next: PasskeyAuthState): void => {
      try {
        state.set(next);
      } catch (error) {
        run.deps.reportDefect(error);
      }
    };

    const fail = (
      error: PasskeyAuthError,
      failureHasDeviceSecret: boolean,
      failureRetried: boolean,
    ): void => {
      setState({
        type: "Failed",
        hasDeviceSecret: failureHasDeviceSecret,
        error,
        // Starting over creates a new DeviceSecret, so it helps only when the
        // passkey is gone for good: the user deleted it, which WebAuthn
        // reports like a dismissed prompt, or it doesn't unwrap the stored
        // secret. The accounts a stored DeviceSecret kept come back only from
        // their mnemonics. Starting over at a new passkey's first refusal would
        // register a second passkey with the same name. A stored secret the
        // passkey doesn't unwrap fails the same way on every retry, so its
        // first failure offers it. An UnknownError says nothing about the
        // passkey, so a setup keeps its pending key, and a transient failure
        // can't register a second passkey. Every retry of a setup gets the
        // pending passkey's key, though, so one that keeps failing offers it
        // after a retry while no secret is stored, which loses nothing. A
        // provider without PRF fails any passkey of a setup, whose next attempt
        // creates another. A stored secret's passkey is the only one that
        // unwraps it, so when it no longer provides PRF, as after a provider's
        // or browser's regression, it keeps failing the same way, and a failed
        // retry offers it. Once started over, it stays offered only while no
        // secret is stored: forgetting a pending key loses nothing, and
        // without that, a setup whose passkey the provider keeps refusing
        // would keep unlocking with that passkey only.
        canStartOver:
          (error.type === "DeviceSecretUnwrapError" ||
            (error.type === "DeviceSecretKeyRefused" &&
              (failureRetried || failureHasDeviceSecret)) ||
            (error.type === "UnknownError" &&
              failureRetried &&
              !failureHasDeviceSecret) ||
            (error.type === "DeviceSecretKeyUnavailable" &&
              failureRetried &&
              failureHasDeviceSecret)) &&
          !(startedOver && failureHasDeviceSecret),
        startedOver,
      });
    };

    return ok(
      disposable<PasskeyAuth>(
        {
          state,

          unlock: () => {
            const current = state.get();
            assert(
              current.type === "Locked" || current.type === "Failed",
              "PasskeyAuth unlocks only while it's Locked or Failed.",
            );
            const failedBefore = current.type === "Failed";
            // unlockWrappedDeviceSecret creates a key only when it found none
            // stored under the lock setups take. A new passkey's first refusal
            // is often Safari's, which refuses the prompt that follows the
            // passkey's creation outside a click, so an attempt that created
            // the passkey, or tried to, isn't a failed retry of an existing
            // one.
            let foundNoKey = false;
            const attemptKeyProvider: DeviceSecretKeyProvider = {
              createKey: (run) => {
                foundNoKey = true;
                return run(keyProvider.createKey);
              },
              getKey: keyProvider.getKey,
            };
            setState({
              type: "Unlocking",
              hasDeviceSecret: current.hasDeviceSecret,
            });
            return actionRun
              .abortable(async (run) => {
                const secret = await run(
                  unlockWrappedDeviceSecret({
                    appName,
                    keyProvider: attemptKeyProvider,
                  }),
                );
                if (secret.ok)
                  setState({ type: "Unlocked", secret: secret.value });
                else {
                  // The start checked it, with the same deps.
                  assert(
                    secret.error.type !== "WrappedDeviceSecretNotPersisted",
                    "getDevicePersistence answers the same for the deps' lifetime, as createEvoluDeps' does.",
                  );
                  fail(
                    secret.error,
                    // Another tab can store or forget a secret meanwhile, but
                    // this attempt read what's stored: it creates a key only
                    // when nothing is, and a secret the passkey doesn't unwrap
                    // is stored.
                    !foundNoKey &&
                      (current.hasDeviceSecret ||
                        secret.error.type === "DeviceSecretUnwrapError"),
                    failedBefore && !foundNoKey,
                  );
                }
                return ok();
              })
              .then(constVoid);
          },

          startOver: ({ confirm }) => {
            const failure = state.get();
            assert(
              failure.type === "Failed" && failure.canStartOver,
              "PasskeyAuth starts over only while it's Failed with canStartOver.",
            );
            setState({
              type: "StartingOver",
              hasDeviceSecret: failure.hasDeviceSecret,
            });
            return actionRun
              .abortable(async (run) => {
                // A pending key wrapped no secret, so forgetting it needs no
                // confirmation. The check runs under the lock setups take, so
                // another tab's setup can't store a secret before the forget,
                // as it can after hasWrappedDeviceSecret.
                const pending = await run(
                  forgetWrappedDeviceSecret(appName, { onlyPending: true }),
                );
                if (!pending.ok) {
                  // A failed start over leaves the passkey's error as it was,
                  // so starting over stays offered.
                  if (pending.error.type !== "WrappedDeviceSecretStoredError") {
                    fail(failure.error, failure.hasDeviceSecret, true);
                    return ok();
                  }
                  // A secret is stored, so starting over loses the accounts
                  // its device database keeps until they're restored.
                  // Awaited through the Run, so disposal ends the wait and a
                  // late answer changes nothing. A confirm that throws or
                  // rejects, as a dialog library can when the user dismisses
                  // it, declines, and its error is reported.
                  const confirmed = await run(
                    promiseToTask(
                      () => Promise.resolve(confirm()),
                      (error) => error,
                    ),
                  );
                  if (!confirmed.ok) run.deps.reportDefect(confirmed.error);
                  if (!confirmed.ok || !confirmed.value) {
                    // Offered again: with a stored secret, the only error
                    // whose offer depends on a retry, DeviceSecretKeyUnavailable,
                    // offers it only after one, as the other errors do anyway.
                    fail(failure.error, true, true);
                    return ok();
                  }
                  const forgotten = await run(
                    forgetWrappedDeviceSecret(appName),
                  );
                  if (!forgotten.ok) {
                    fail(failure.error, true, true);
                    return ok();
                  }
                }
                startedOver = true;
                setState({ type: "Locked", hasDeviceSecret: false });
                return ok();
              })
              .then(constVoid);
          },
        },
        disposer,
      ),
    );
  };

/** Labels the browser or passkey provider shows when it creates a passkey. */
export interface CreatePasskeyKeyProviderOptions {
  /** The app name shown for the current site. */
  readonly rpName: string;
  /** The label of the passkey in the passkey provider. */
  readonly userName: string;
}

/**
 * Creates a {@link DeviceSecretKeyProvider} whose keys are passkeys of the
 * current site and their WebAuthn PRF outputs. Pass it to
 * {@link unlockWrappedDeviceSecret}.
 *
 * Creating a key registers a discoverable passkey with user verification and a
 * fresh random user handle, so registrations don't replace each other, and
 * requests PRF, which security keys enable only at registration. Getting a key
 * evaluates a fixed, versioned PRF input with user verification. Creating a key
 * evaluates none, because a provider can support PRF at registration and not
 * later, so `unlockWrappedDeviceSecret` gets a new key with a second prompt,
 * which proves that unlocking works before it stores a secret. PRF support
 * varies with the browser and the passkey provider, and some report no PRF at
 * registration but provide it when getting the key, as Samsung Pass does, so
 * creating a key ignores what registration reports, and getting the key of a
 * passkey without PRF fails with `DeviceSecretKeyUnavailable`. A refusal,
 * `DeviceSecretKeyRefused`, can mean the user dismissed the prompt, the passkey
 * is gone, the provider refuses PRF, as Microsoft Password Manager does, or a
 * password manager's browser extension took the request over while locked and
 * the user closed its prompt. Let the user try again, and offer to start over
 * with {@link forgetWrappedDeviceSecret}, as `unlockWrappedDeviceSecret`
 * describes.
 *
 * Safari may require each WebAuthn request to start in a user gesture, such as
 * a button click. Safari returns a different PRF output from other browsers for
 * the same USB or NFC security key; see [WebKit bug
 * 311099](https://bugs.webkit.org/show_bug.cgi?id=311099).
 */
export const createPasskeyKeyProvider = ({
  rpName,
  userName,
}: CreatePasskeyKeyProviderOptions): DeviceSecretKeyProvider => ({
  createKey: async ({ deps, signal }) => {
    const credential = await tryAsync(
      () =>
        navigator.credentials.create({
          publicKey: {
            rp: { name: rpName },
            user: {
              id: new Uint8Array(deps.randomBytes.create(32)),
              name: userName,
              displayName: userName,
            },
            challenge: new Uint8Array(deps.randomBytes.create(32)),
            pubKeyCredParams: [
              // EdDSA, ES256 and RS256 cover a range of authenticators.
              { type: "public-key", alg: -8 },
              { type: "public-key", alg: -7 },
              { type: "public-key", alg: -257 },
            ],
            authenticatorSelection: {
              residentKey: "required",
              userVerification: "required",
            },
            extensions: { prf: {} },
          },
          signal,
        }),
      passkeyRequestError,
    );
    if (!credential.ok) {
      signal.throwIfAborted();
      return credential;
    }
    const { value } = credential;
    // An extension or a password manager can wrap the credential, whose
    // accessors can then throw, and replace the page's globals, so the
    // credential is checked and read as the call is. What registration reports
    // about PRF isn't read: a passkey reported without it can still provide it
    // when getting the key, as a Samsung Pass passkey does, which
    // unlockWrappedDeviceSecret does next and which fails with
    // DeviceSecretKeyUnavailable when it can't. That costs a provider without
    // PRF one more prompt, and its pending key is removed.
    const read = trySync(
      () =>
        value instanceof PublicKeyCredential
          ? new Uint8Array(value.rawId)
          : null,
      createUnknownError,
    );
    if (!read.ok) return read;
    if (!read.value)
      return err(
        createUnknownError("WebAuthn returned no public key credential"),
      );
    const keyId = DeviceSecretKeyId.fromUnknown(read.value);
    return keyId.ok
      ? keyId
      : err(createUnknownError("WebAuthn returned an invalid credential ID"));
  },

  getKey:
    (keyId) =>
    async ({ deps, signal }) => {
      const credential = await tryAsync(
        () =>
          navigator.credentials.get({
            publicKey: {
              challenge: new Uint8Array(deps.randomBytes.create(32)),
              allowCredentials: [
                { type: "public-key", id: new Uint8Array(keyId) },
              ],
              userVerification: "required",
              extensions: { prf: { eval: { first: passkeyPrfInput } } },
            },
            signal,
          }),
        passkeyRequestError,
      );
      if (!credential.ok) {
        signal.throwIfAborted();
        return credential;
      }
      const assertion = credential.value;
      // Checked and read as at registration.
      const read = trySync(() => {
        if (!(assertion instanceof PublicKeyCredential)) return null;
        const { response } = assertion;
        const first = assertion.getClientExtensionResults().prf?.results?.first;
        return {
          rawId: new Uint8Array(assertion.rawId),
          authenticatorData:
            response instanceof AuthenticatorAssertionResponse
              ? new Uint8Array(response.authenticatorData)
              : null,
          prfOutput: ArrayBuffer.isView(first)
            ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
            : first instanceof ArrayBuffer
              ? new Uint8Array(first)
              : first,
        };
      }, createUnknownError);
      if (!read.ok) return read;
      if (!read.value)
        return err(
          createUnknownError("WebAuthn returned no public key credential"),
        );
      const { rawId, authenticatorData, prfOutput } = read.value;
      if (!eqUint8Array(rawId, keyId))
        return err(createUnknownError("WebAuthn returned another credential"));
      // The client enforces "required", and the flag shows the authenticator
      // verified the user, so nothing evaluates the PRF without them.
      if (
        !authenticatorData ||
        ((authenticatorData[32] ?? 0) & userVerifiedFlag) === 0
      )
        return err(
          createUnknownError("WebAuthn returned an unverified assertion"),
        );

      // Safari returns a null PRF result for security keys with built-in user
      // verification, such as the YubiKey Bio, so null counts as no PRF; see
      // https://bugs.webkit.org/show_bug.cgi?id=314934.
      if (prfOutput == null) return err({ type: "DeviceSecretKeyUnavailable" });
      const output = Entropy32.fromUnknown(prfOutput);
      return output.ok
        ? output
        : err(
            createUnknownError(
              "WebAuthn returned a PRF output that isn't 32 bytes",
            ),
          );
    },
});

// Permanent once shipped: another input gives another key, which can't unwrap
// stored secrets.
const passkeyPrfInput = new TextEncoder().encode(
  "Evolu DeviceSecret wrapping key v1",
);

// The UV bit of the flags byte after the 32-byte RP ID hash.
const userVerifiedFlag = 0x04;

// A DOMException is an Error, as WebIDL defines it, and a wrapper in the page,
// such as a password manager's, can throw an Error of the same name.
const passkeyRequestError = (
  error: unknown,
): DeviceSecretKeyRefusedError | UnknownError =>
  error instanceof Error && error.name === "NotAllowedError"
    ? { type: "DeviceSecretKeyRefused" }
    : createUnknownError(error);
