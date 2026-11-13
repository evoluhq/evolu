import {
  AbortError,
  AppName,
  assert,
  assertEqual,
  assertEqualBytes,
  assertErr,
  assertFalse,
  assertNotUndefined,
  assertOk,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
  constVoid,
  createConsole,
  DeviceSecretKeyId,
  eqArrayNumber,
  forgetWrappedDeviceSecret,
  testCreateRun,
  type DeviceSecretKeyError,
  type Name,
  type Result,
  type Task,
} from "@evolu/common";
import type { DevicePersistence, EvoluDeps } from "@evolu/common/local-first";
import {
  createEvoluDeps,
  createPasskeyAuth,
  createPasskeyKeyProvider,
  createRun,
} from "@evolu/web";
import { describe, onTestFinished, test, vi } from "vitest";
import { cdp, server } from "vitest/browser";
import { testGlobalUncaughtErrors } from "../../shared/_vitest.ts";
import { removeTestDatabase } from "./_removeTestDatabase.ts";

const setupVirtualAuthenticator = async (
  disposer: AsyncDisposableStack,
  hasPrf = true,
) => {
  const session = cdp();
  await session.send("WebAuthn.enable");
  disposer.defer(async () => {
    await session.send("WebAuthn.disable");
  });

  const { authenticatorId } = await session.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        hasPrf,
      },
    },
  );
  disposer.defer(async () => {
    await session.send("WebAuthn.removeVirtualAuthenticator", {
      authenticatorId,
    });
  });

  return { session, authenticatorId };
};

const provider = createPasskeyKeyProvider({
  rpName: "Evolu",
  userName: "Device",
});

// Vitest's Playwright provider exposes CDP only for Chromium.
describe.skipIf(server.browser !== "chromium")("passkey key provider", () => {
  test("gets the same 32-byte key for a passkey, from the v1 PRF input", async () => {
    await using disposer = new AsyncDisposableStack();
    await setupVirtualAuthenticator(disposer);
    await using run = testCreateRun();
    const keyId = await run.orThrow(provider.createKey);

    using get = vi.spyOn(navigator.credentials, "get");
    const first = await run.orThrow(provider.getKey(keyId));
    const second = await run.orThrow(provider.getKey(keyId));
    const expectedInput = new TextEncoder().encode(
      "Evolu DeviceSecret wrapping key v1",
    );

    assertEqual(get.mock.calls.length, 2);
    for (const [options] of get.mock.calls) {
      assertEqual(options?.publicKey?.extensions?.prf, {
        eval: { first: expectedInput },
      });
    }
    assertEqual(first.length, 32);
    assertEqualBytes(first, second);
  });

  test("registers with a fresh random user handle, user verification, and PRF", async () => {
    await using disposer = new AsyncDisposableStack();
    await setupVirtualAuthenticator(disposer);
    await using run = testCreateRun();

    using create = vi.spyOn(navigator.credentials, "create");
    await run.orThrow(provider.createKey);
    await run.orThrow(provider.createKey);

    const [first, second] = create.mock.calls.map(
      ([options]) => options?.publicKey,
    );
    assertNotUndefined(first);
    assertNotUndefined(second);
    const firstUserId = new Uint8Array(first.user.id as Uint8Array);
    assertEqual(firstUserId.byteLength, 32);
    // A constant handle would replace the earlier passkey in the provider,
    // and with it the only key to its wrapped secret.
    assertFalse(
      eqArrayNumber(firstUserId, new Uint8Array(second.user.id as Uint8Array)),
    );
    assertEqual(first.authenticatorSelection, {
      residentKey: "required",
      userVerification: "required",
    });
    assertEqual(first.extensions, { prf: {} });
  });

  test("gets another key for another passkey", async () => {
    await using disposer = new AsyncDisposableStack();
    await setupVirtualAuthenticator(disposer);
    await using run = testCreateRun();
    const first = await run.orThrow(
      provider.getKey(await run.orThrow(provider.createKey)),
    );
    const second = await run.orThrow(
      provider.getKey(await run.orThrow(provider.createKey)),
    );

    assertFalse(eqArrayNumber(first, second));
  });

  test("registers with an authenticator that reports no PRF, then reports getting its key as unavailable", async () => {
    await using disposer = new AsyncDisposableStack();
    await setupVirtualAuthenticator(disposer, false);
    await using run = testCreateRun();
    using create = vi.spyOn(navigator.credentials, "create");

    // Chrome reports prf.enabled false here, which registration ignores,
    // because some providers report it and then provide PRF output anyway.
    const keyId = await run.orThrow(provider.createKey);
    const created = await create.mock.results[0]?.value;
    assertTrue(created instanceof PublicKeyCredential);
    assertSame(created.getClientExtensionResults().prf?.enabled, false);
    assertErr(await run(provider.getKey(keyId)), {
      type: "DeviceSecretKeyUnavailable",
    });
  });

  test("reports a removed passkey as refused", async () => {
    await using disposer = new AsyncDisposableStack();
    const { session, authenticatorId } =
      await setupVirtualAuthenticator(disposer);
    await using run = testCreateRun();
    const keyId = await run.orThrow(provider.createKey);

    await session.send("WebAuthn.removeCredential", {
      authenticatorId,
      credentialId: keyId.toBase64(),
    });
    assertErr(await run(provider.getKey(keyId)), {
      type: "DeviceSecretKeyRefused",
    });
  });
});

/**
 * An assertion as WebAuthn returns it, for the cases a virtual authenticator
 * can't produce.
 */
const setupAssertion = ({
  rawId,
  flags,
  prfOutput,
}: {
  rawId: Uint8Array;
  flags: number;
  prfOutput: unknown;
}): PublicKeyCredential => {
  const authenticatorData = new Uint8Array(37);
  authenticatorData[32] = flags;
  const response = Object.create(AuthenticatorAssertionResponse.prototype, {
    authenticatorData: { value: authenticatorData.buffer },
  }) as AuthenticatorAssertionResponse;
  return Object.create(PublicKeyCredential.prototype, {
    rawId: { value: new Uint8Array(rawId).buffer },
    response: { value: response },
    getClientExtensionResults: {
      value: () => ({ prf: { results: { first: prfOutput } } }),
    },
  }) as PublicKeyCredential;
};

describe("passkey key provider with stubbed WebAuthn", () => {
  const keyId = DeviceSecretKeyId.orThrow(new Uint8Array([1, 2, 3]));
  // User present and user verified.
  const verified = 0x05;
  const output = new Uint8Array(32).fill(7);

  const getKey = async (assertion: PublicKeyCredential) => {
    await using run = testCreateRun();
    using _get = vi
      .spyOn(navigator.credentials, "get")
      .mockResolvedValue(assertion);
    return await run(provider.getKey(keyId));
  };

  const assertUnknownError = (result: Result<unknown, { type: string }>) => {
    assertErr(result);
    assertSame(result.error.type, "UnknownError");
  };

  test("gets the key of the passkey it names, with required user verification", async () => {
    await using run = testCreateRun();
    using get = vi
      .spyOn(navigator.credentials, "get")
      .mockResolvedValue(
        setupAssertion({ rawId: keyId, flags: verified, prfOutput: output }),
      );

    assertOk(await run(provider.getKey(keyId)));

    const [options] = get.mock.calls[0] ?? [];
    assertEqual(options?.publicKey?.allowCredentials, [
      { type: "public-key", id: new Uint8Array(keyId) },
    ]);
    // Without it, anyone holding the device could get the key.
    assertSame(options?.publicKey?.userVerification, "required");
  });

  test("ends as aborted when its Run aborts a prompt, while registering or getting the key", async () => {
    // A prompt rejects with the reason of the signal it was given, as in a
    // browser. Without a signal, it gives no credential.
    const promptUntilAborted = (
      options?: CredentialCreationOptions | CredentialRequestOptions,
    ) =>
      new Promise<null>((resolve, reject) => {
        const signal = options?.signal;
        if (!signal) {
          resolve(null);
          return;
        }
        signal.addEventListener("abort", () => {
          // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- A prompt rejects with its signal's reason.
          reject(signal.reason);
        });
      });
    const abortPrompt = async <T>(task: Task<T, DeviceSecretKeyError>) => {
      await using run = testCreateRun();
      const fiber = run.abortable(task);
      fiber.abort();
      const result = await fiber;
      assertErr(result);
      assertTrue(AbortError.is(result.error));
    };

    {
      using _create = vi
        .spyOn(navigator.credentials, "create")
        .mockImplementation(promptUntilAborted);
      await abortPrompt(provider.createKey);
    }
    using _get = vi
      .spyOn(navigator.credentials, "get")
      .mockImplementation(promptUntilAborted);
    await abortPrompt(provider.getKey(keyId));
  });

  test("returns UnknownError for a credential whose fields throw, as an extension wrapping it can, at registration and when getting the key", async () => {
    const throwing = {
      get: (): never => {
        throw new Error("Wrapped.");
      },
    };
    const throwingMethod = {
      value: (): never => {
        throw new Error("Wrapped.");
      },
    };
    const authenticatorData = new Uint8Array(37);
    authenticatorData[32] = verified;
    const response = (data: PropertyDescriptor) =>
      Object.create(AuthenticatorAssertionResponse.prototype, {
        authenticatorData: data,
      }) as AuthenticatorAssertionResponse;
    const credential = (descriptors: PropertyDescriptorMap) =>
      Object.create(PublicKeyCredential.prototype, {
        rawId: { value: new Uint8Array(keyId).buffer },
        response: { value: response({ value: authenticatorData.buffer }) },
        getClientExtensionResults: {
          value: () => ({ prf: { results: { first: output } } }),
        },
        ...descriptors,
      }) as PublicKeyCredential;
    // The credential is valid with no field throwing.
    assertOk(await getKey(credential({})));

    // Registration reads only the credential ID.
    {
      await using run = testCreateRun();
      using _create = vi
        .spyOn(navigator.credentials, "create")
        .mockResolvedValue(credential({ rawId: throwing }));
      assertUnknownError(await run(provider.createKey));
    }
    for (const descriptors of [
      { rawId: throwing },
      { response: throwing },
      { response: { value: response(throwing) } },
      { getClientExtensionResults: throwingMethod },
      {
        getClientExtensionResults: {
          value: () => ({
            prf: { results: Object.defineProperty({}, "first", throwing) },
          }),
        },
      },
    ])
      assertUnknownError(await getKey(credential(descriptors)));
  });

  test("accepts a PRF output as an ArrayBuffer or as a view", async () => {
    // Other bytes around it, so a read that drops the view's offset differs.
    const backing = new Uint8Array(40);
    backing.set(output, 4);
    const view = backing.subarray(4, 36);
    for (const prfOutput of [output.slice().buffer, view]) {
      const result = await getKey(
        setupAssertion({ rawId: keyId, flags: verified, prfOutput }),
      );
      assertOk(result);
      assertEqualBytes(result.value, output);
    }
  });

  test("rejects a PRF output that isn't 32 bytes", async () => {
    for (const prfOutput of ["bytes", new Uint8Array(16)])
      assertUnknownError(
        await getKey(
          setupAssertion({ rawId: keyId, flags: verified, prfOutput }),
        ),
      );
  });

  test("rejects an assertion for another passkey or without user verification", async () => {
    assertUnknownError(
      await getKey(
        setupAssertion({
          rawId: new Uint8Array([9]),
          flags: verified,
          prfOutput: output,
        }),
      ),
    );
    // User present only.
    assertUnknownError(
      await getKey(
        setupAssertion({ rawId: keyId, flags: 0x01, prfOutput: output }),
      ),
    );
  });

  test("registers a passkey whose provider doesn't report PRF support", async () => {
    await using run = testCreateRun();
    using _create = vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      Object.create(PublicKeyCredential.prototype, {
        rawId: { value: new Uint8Array(keyId).buffer },
        getClientExtensionResults: { value: () => ({}) },
      }) as PublicKeyCredential,
    );

    assertOk(await run(provider.createKey), keyId);
  });

  test("reports an assertion without a PRF output as unavailable", async () => {
    assertErr(
      await getKey(
        setupAssertion({ rawId: keyId, flags: verified, prfOutput: undefined }),
      ),
      { type: "DeviceSecretKeyUnavailable" },
    );
  });

  test("reports a refused registration", async () => {
    await using run = testCreateRun();
    using _create = vi
      .spyOn(navigator.credentials, "create")
      .mockRejectedValue(new DOMException("Refused.", "NotAllowedError"));

    assertErr(await run(provider.createKey), {
      type: "DeviceSecretKeyRefused",
    });
  });

  test("reports an Error named NotAllowedError as refused, as a wrapper in the page can throw, and no other value of that name", async () => {
    await using run = testCreateRun();
    const named = Object.assign(new Error("Refused."), {
      name: "NotAllowedError",
    });
    {
      using _get = vi
        .spyOn(navigator.credentials, "get")
        .mockRejectedValue(named);
      assertErr(await run(provider.getKey(keyId)), {
        type: "DeviceSecretKeyRefused",
      });
    }
    using _get = vi
      .spyOn(navigator.credentials, "get")
      .mockRejectedValue({ name: "NotAllowedError" });
    assertUnknownError(await run(provider.getKey(keyId)));
  });

  test("returns UnknownError when WebAuthn gives no credential, at registration and when getting the key", async () => {
    await using run = testCreateRun();
    {
      using _create = vi
        .spyOn(navigator.credentials, "create")
        .mockResolvedValue(null);
      assertUnknownError(await run(provider.createKey));
    }
    using _get = vi.spyOn(navigator.credentials, "get").mockResolvedValue(null);
    assertUnknownError(await run(provider.getKey(keyId)));
  });

  test("returns UnknownError where the page lacks the PublicKeyCredential global, as a wrapper can leave it, at registration and when getting the key", async () => {
    await using run = testCreateRun();
    const credential = setupAssertion({
      rawId: keyId,
      flags: verified,
      prfOutput: output,
    });
    using _create = vi
      .spyOn(navigator.credentials, "create")
      .mockResolvedValue(credential);
    using _get = vi
      .spyOn(navigator.credentials, "get")
      .mockResolvedValue(credential);
    vi.stubGlobal("PublicKeyCredential", undefined);
    try {
      assertUnknownError(await run(provider.createKey));
      assertUnknownError(await run(provider.getKey(keyId)));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("returns UnknownError for a registration with an empty credential ID", async () => {
    await using run = testCreateRun();
    using _create = vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      Object.create(PublicKeyCredential.prototype, {
        rawId: { value: new ArrayBuffer(0) },
        getClientExtensionResults: {
          value: () => ({ prf: { enabled: true } }),
        },
      }) as PublicKeyCredential,
    );

    assertUnknownError(await run(provider.createKey));
  });

  test("rejects an assertion whose response isn't an assertion response", async () => {
    assertUnknownError(
      await getKey(
        Object.create(PublicKeyCredential.prototype, {
          rawId: { value: new Uint8Array(keyId).buffer },
          response: { value: {} },
          getClientExtensionResults: {
            value: () => ({ prf: { results: { first: output } } }),
          },
        }) as PublicKeyCredential,
      ),
    );
  });
});

/**
 * The cases that "Passkeys & WebAuthn PRF"
 * (https://www.corbado.com/blog/passkeys-prf-webauthn) describes, as the
 * passkey providers and browsers it names behave.
 */
describe("createPasskeyAuth", () => {
  // User present and user verified.
  const verified = 0x05;

  /** Removes the databases the test created, once their DbWorkers closed. */
  const setupDatabaseCleanup = async (): Promise<void> => {
    const root = await navigator.storage.getDirectory();
    const listNames = async (): Promise<Set<string>> => {
      const names = new Set<string>();
      // A directory handle is async iterable, which TypeScript's DOM lib
      // types only with DOM.AsyncIterable.
      for await (const [name] of root as unknown as AsyncIterable<
        [string, FileSystemHandle]
      >)
        names.add(name);
      return names;
    };
    const before = await listNames();
    onTestFinished(async () => {
      for (const name of await listNames())
        if (!before.has(name) && name.startsWith("."))
          await removeTestDatabase(name.slice(1) as Name);
    });
  };

  /** The web deps, which start the production SharedWorker and DbWorkers. */
  const setupDeps = async (disposer: AsyncDisposableStack) => {
    await setupDatabaseCleanup();
    return disposer.use(
      createEvoluDeps({
        console: createConsole({ level: "silent" }),
        reloadApp: constVoid,
        requestPersistentStorage: constVoid,
      }),
    );
  };

  /** A PasskeyAuth of the app, as one start of the app creates it. */
  const setupPasskeyAuth = async (
    disposer: AsyncDisposableStack,
    deps: EvoluDeps,
    appName: AppName,
    getDevicePersistence?: () => Promise<DevicePersistence>,
  ) => {
    const run = disposer.use(
      createRun({
        ...deps,
        ...(getDevicePersistence && { getDevicePersistence }),
      }),
    );
    return disposer.use(
      await run.orThrow(
        createPasskeyAuth({ appName, rpName: "Evolu", userName: "Device" }),
      ),
    );
  };

  const createAppName = () => AppName.orThrow(`pk-${crypto.randomUUID()}`);

  /**
   * A passkey provider, stubbed to behave at creation and when getting a key as
   * the providers the page lists do. Each passkey has a PRF output of its own.
   */
  const setupStubProvider = (behavior: {
    create: "Prf" | "NoPrf" | "Refuse";
    get: "Prf" | "NoPrf" | "NullPrf" | "OtherPrf" | "Refuse" | "Unverified";
  }) => {
    const prfOutputsById = new Map<string, Uint8Array>();
    const create = vi
      .spyOn(navigator.credentials, "create")
      .mockImplementation(() => {
        if (behavior.create === "Refuse")
          return Promise.reject(
            new DOMException("Refused.", "NotAllowedError"),
          );
        const rawId = new Uint8Array([prfOutputsById.size + 1]);
        prfOutputsById.set(
          rawId.toString(),
          crypto.getRandomValues(new Uint8Array(32)),
        );
        return Promise.resolve(
          Object.create(PublicKeyCredential.prototype, {
            rawId: { value: rawId.buffer },
            getClientExtensionResults: {
              value: () => ({ prf: { enabled: behavior.create === "Prf" } }),
            },
          }) as PublicKeyCredential,
        );
      });
    const get = vi
      .spyOn(navigator.credentials, "get")
      .mockImplementation((options) => {
        if (behavior.get === "Refuse")
          return Promise.reject(
            new DOMException("Refused.", "NotAllowedError"),
          );
        const allowed = options?.publicKey?.allowCredentials?.[0]?.id;
        assert(allowed instanceof Uint8Array, "Expected the passkey's ID.");
        return Promise.resolve(
          setupAssertion({
            rawId: allowed,
            // User present only, which fails as an UnknownError.
            flags: behavior.get === "Unverified" ? 0x01 : verified,
            prfOutput:
              behavior.get === "Prf"
                ? prfOutputsById.get(allowed.toString())
                : behavior.get === "OtherPrf"
                  ? crypto.getRandomValues(new Uint8Array(32))
                  : behavior.get === "NullPrf"
                    ? null
                    : undefined,
          }),
        );
      });
    return {
      behavior,
      create,
      get,
      [Symbol.dispose]: () => {
        create.mockRestore();
        get.mockRestore();
      },
    };
  };

  test("unlocks with a passkey that has PRF at creation and when getting its key, and unlocks the same secret at the next start", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    const appName = createAppName();
    using provider = setupStubProvider({ create: "Prf", get: "Prf" });

    const auth = await setupPasskeyAuth(disposer, deps, appName);
    assertEqual(auth.state.get(), { type: "Locked", hasDeviceSecret: false });
    await auth.unlock();
    const unlocked = auth.state.get();
    assert(unlocked.type === "Unlocked", "Expected the secret.");

    const next = await setupPasskeyAuth(disposer, deps, appName);
    assertEqual(next.state.get(), { type: "Locked", hasDeviceSecret: true });
    await next.unlock();
    assertEqual(next.state.get(), unlocked);
    assertSame(provider.create.mock.calls.length, 1);
  });

  test("fails as refused at a provider that refuses every key with PRF, as Microsoft Password Manager does, offers a start over once a retry fails, and forgets the pending key without confirmation", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using provider = setupStubProvider({ create: "Prf", get: "Refuse" });
    const auth = await setupPasskeyAuth(disposer, deps, createAppName());
    const refused = { type: "DeviceSecretKeyRefused" } as const;

    await auth.unlock();
    assertEqual(auth.state.get(), {
      type: "Failed",
      hasDeviceSecret: false,
      error: refused,
      canStartOver: false,
      startedOver: false,
    });
    await auth.unlock();
    assertEqual(auth.state.get(), {
      type: "Failed",
      hasDeviceSecret: false,
      error: refused,
      canStartOver: true,
      startedOver: false,
    });
    const confirm = vi.fn(() => true);
    await auth.startOver({ confirm });
    assertEqual(auth.state.get(), { type: "Locked", hasDeviceSecret: false });
    assertSame(confirm.mock.calls.length, 0);

    // Another passkey of the same provider fails the same way.
    await auth.unlock();
    assertEqual(auth.state.get(), {
      type: "Failed",
      hasDeviceSecret: false,
      error: refused,
      canStartOver: false,
      startedOver: true,
    });
    assertSame(provider.create.mock.calls.length, 2);
  });

  test("keeps a setup's pending key at an unknown error, offers a start over once a retry fails the same way, and forgets the pending key without confirmation", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using provider = setupStubProvider({ create: "Prf", get: "Unverified" });
    const auth = await setupPasskeyAuth(disposer, deps, createAppName());
    const assertFailed = (canStartOver: boolean) => {
      const state = auth.state.get();
      assert(state.type === "Failed", "Expected a failure.");
      assertSame(state.error.type, "UnknownError");
      assertSame(state.hasDeviceSecret, false);
      assertSame(state.canStartOver, canStartOver);
    };

    await auth.unlock();
    assertFailed(false);
    await auth.unlock();
    assertFailed(true);
    // The retry got the pending passkey's key.
    assertSame(provider.create.mock.calls.length, 1);

    const confirm = vi.fn(() => true);
    await auth.startOver({ confirm });
    assertEqual(auth.state.get(), { type: "Locked", hasDeviceSecret: false });
    assertSame(confirm.mock.calls.length, 0);
    provider.behavior.get = "Prf";
    await auth.unlock();
    assertSame(auth.state.get().type, "Unlocked");
    assertSame(provider.create.mock.calls.length, 2);
  });

  test("doesn't offer a start over at an unknown error while a secret is stored", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    const appName = createAppName();
    using provider = setupStubProvider({ create: "Prf", get: "Prf" });
    await (await setupPasskeyAuth(disposer, deps, appName)).unlock();

    provider.behavior.get = "Unverified";
    const auth = await setupPasskeyAuth(disposer, deps, appName);
    await auth.unlock();
    await auth.unlock();

    const state = auth.state.get();
    assert(state.type === "Failed", "Expected a failure.");
    assertSame(state.error.type, "UnknownError");
    assertSame(state.hasDeviceSecret, true);
    assertFalse(state.canStartOver);
  });

  test("unlocks with a passkey that reports no PRF at creation but provides it when getting its key", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using _provider = setupStubProvider({ create: "NoPrf", get: "Prf" });
    const auth = await setupPasskeyAuth(disposer, deps, createAppName());

    await auth.unlock();

    assertSame(auth.state.get().type, "Unlocked");
  });

  test("fails as unavailable at a provider without PRF, as Dashlane, NordPass, and Chrome's profile authenticator are, removes the pending key, and creates another passkey next, each requesting PRF", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using provider = setupStubProvider({ create: "NoPrf", get: "NoPrf" });
    const auth = await setupPasskeyAuth(disposer, deps, createAppName());
    const unavailable = {
      type: "Failed",
      hasDeviceSecret: false,
      error: { type: "DeviceSecretKeyUnavailable" },
      canStartOver: false,
      startedOver: false,
    } as const;

    await auth.unlock();
    assertEqual(auth.state.get(), unavailable);
    await auth.unlock();
    assertEqual(auth.state.get(), unavailable);

    // The pending key was removed, so the retry created another passkey.
    assertSame(provider.create.mock.calls.length, 2);
    // Security keys provide PRF only if it was requested at creation.
    for (const [options] of provider.create.mock.calls)
      assertEqual(options?.publicKey?.extensions, { prf: {} });
  });

  test("never asks for client capabilities, which some providers report with PRF they don't provide", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using _provider = setupStubProvider({ create: "Prf", get: "Prf" });
    const getClientCapabilities = vi.fn(() => Promise.resolve({}));
    const original = Object.getOwnPropertyDescriptor(
      PublicKeyCredential,
      "getClientCapabilities",
    );
    Object.defineProperty(PublicKeyCredential, "getClientCapabilities", {
      configurable: true,
      value: getClientCapabilities,
    });
    try {
      const auth = await setupPasskeyAuth(disposer, deps, createAppName());
      await auth.unlock();
      assertSame(auth.state.get().type, "Unlocked");
    } finally {
      if (original)
        Object.defineProperty(
          PublicKeyCredential,
          "getClientCapabilities",
          original,
        );
      else Reflect.deleteProperty(PublicKeyCredential, "getClientCapabilities");
    }
    assertSame(getClientCapabilities.mock.calls.length, 0);
  });

  test("fails to unwrap with another PRF output of the same passkey, as Safari gives for some security keys, and offers a start over at once", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    const appName = createAppName();
    using provider = setupStubProvider({ create: "Prf", get: "Prf" });
    await (await setupPasskeyAuth(disposer, deps, appName)).unlock();

    provider.behavior.get = "OtherPrf";
    const next = await setupPasskeyAuth(disposer, deps, appName);
    await next.unlock();

    assertEqual(next.state.get(), {
      type: "Failed",
      hasDeviceSecret: true,
      error: { type: "DeviceSecretUnwrapError" },
      canStartOver: true,
      startedOver: false,
    });
  });

  test("offers a start over once a retry fails as unavailable for a stored secret whose passkey no longer provides PRF", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    const appName = createAppName();
    using provider = setupStubProvider({ create: "Prf", get: "Prf" });
    await (await setupPasskeyAuth(disposer, deps, appName)).unlock();

    // The only passkey that unwraps the secret, as after a regression of its
    // provider.
    provider.behavior.get = "NoPrf";
    const auth = await setupPasskeyAuth(disposer, deps, appName);
    const unavailable = (canStartOver: boolean) =>
      ({
        type: "Failed",
        hasDeviceSecret: true,
        error: { type: "DeviceSecretKeyUnavailable" },
        canStartOver,
        startedOver: false,
      }) as const;

    await auth.unlock();
    assertEqual(auth.state.get(), unavailable(false));
    await auth.unlock();
    assertEqual(auth.state.get(), unavailable(true));
    assertSame(provider.create.mock.calls.length, 1);
  });

  test("doesn't offer a start over when a setup's pending passkey fails as unavailable, whose next attempt creates another", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using provider = setupStubProvider({ create: "Prf", get: "Refuse" });
    const auth = await setupPasskeyAuth(disposer, deps, createAppName());
    await auth.unlock();

    // A retry with the pending passkey, which the refusal kept.
    provider.behavior.get = "NoPrf";
    await auth.unlock();

    assertEqual(auth.state.get(), {
      type: "Failed",
      hasDeviceSecret: false,
      error: { type: "DeviceSecretKeyUnavailable" },
      canStartOver: false,
      startedOver: false,
    });
    assertSame(provider.create.mock.calls.length, 1);
  });

  test("fails as unavailable with a null PRF output, as Safari gives for security keys with built-in user verification", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using _provider = setupStubProvider({ create: "Prf", get: "NullPrf" });
    const auth = await setupPasskeyAuth(disposer, deps, createAppName());

    await auth.unlock();

    assertEqual(auth.state.get(), {
      type: "Failed",
      hasDeviceSecret: false,
      error: { type: "DeviceSecretKeyUnavailable" },
      canStartOver: false,
      startedOver: false,
    });
  });

  test("asks to confirm a start over that forgets a stored secret whose passkey is gone, keeps the failure when declined, and starts over when confirmed", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    const appName = createAppName();
    using provider = setupStubProvider({ create: "Prf", get: "Prf" });
    const first = await setupPasskeyAuth(disposer, deps, appName);
    await first.unlock();
    const firstSecret = first.state.get();

    // The user deleted the passkey, which WebAuthn reports like a dismissed
    // prompt.
    provider.behavior.get = "Refuse";
    const auth = await setupPasskeyAuth(disposer, deps, appName);
    await auth.unlock();
    const failure = {
      type: "Failed",
      hasDeviceSecret: true,
      error: { type: "DeviceSecretKeyRefused" },
      canStartOver: true,
      startedOver: false,
    } as const;
    assertEqual(auth.state.get(), failure);

    const decline = vi.fn(() => false);
    await auth.startOver({ confirm: decline });
    assertSame(decline.mock.calls.length, 1);
    assertEqual(auth.state.get(), failure);

    await auth.startOver({ confirm: () => Promise.resolve(true) });
    assertEqual(auth.state.get(), { type: "Locked", hasDeviceSecret: false });
    provider.behavior.get = "Prf";
    await auth.unlock();
    const secret = auth.state.get();
    assert(secret.type === "Unlocked", "Expected a new secret.");
    assertFalse(
      eqArrayNumber(secret.secret, (firstSecret as typeof secret).secret),
    );
  });

  /**
   * A PasskeyAuth of the app with its own root Run, whose defects the browser
   * reports as uncaught errors, as the web's createRun reports them.
   */
  const setupPasskeyAuthWithRun = async (
    disposer: AsyncDisposableStack,
    deps: EvoluDeps,
    appName: AppName,
  ) => {
    const run = disposer.use(createRun(deps));
    const auth = disposer.use(
      await run.orThrow(
        createPasskeyAuth({ appName, rpName: "Evolu", userName: "Device" }),
      ),
    );
    return { run, auth };
  };

  /** A failure that offers to start over, with a stored secret to confirm. */
  const setupStoredFailure = async (
    disposer: AsyncDisposableStack,
    deps: EvoluDeps,
    provider: ReturnType<typeof setupStubProvider>,
  ) => {
    const appName = createAppName();
    const first = await setupPasskeyAuth(disposer, deps, appName);
    await first.unlock();
    // The user deleted the passkey, which WebAuthn reports like a dismissed
    // prompt.
    provider.behavior.get = "Refuse";
    const setup = await setupPasskeyAuthWithRun(disposer, deps, appName);
    await setup.auth.unlock();
    const failure = {
      type: "Failed",
      hasDeviceSecret: true,
      error: { type: "DeviceSecretKeyRefused" },
      canStartOver: true,
      startedOver: false,
    } as const;
    assertEqual(setup.auth.state.get(), failure);
    return { ...setup, failure };
  };

  for (const [how, confirm] of [
    ["rejects", (error: Error) => () => Promise.reject(error)],
    [
      "throws",
      (error: Error) => (): boolean => {
        throw error;
      },
    ],
  ] as const)
    test(`declines a start over whose confirm ${how}, as a dismissed dialog can, reports the error, and keeps the root Run`, async () => {
      await using disposer = new AsyncDisposableStack();
      const deps = await setupDeps(disposer);
      using provider = setupStubProvider({ create: "Prf", get: "Prf" });
      const { run, auth, failure } = await setupStoredFailure(
        disposer,
        deps,
        provider,
      );
      using uncaughtErrors = testGlobalUncaughtErrors();
      const error = new Error("The dialog was dismissed.");

      await auth.startOver({ confirm: confirm(error) });

      assertEqual(auth.state.get(), failure);
      assertFalse(run.signal.aborted);
      const reported = await uncaughtErrors.settle();
      assertSame(reported.length, 1);
      assertSame(reported[0], error);
    });

  test("finishes an unlock whose state listener throws, reports the error, and keeps the root Run", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using _provider = setupStubProvider({ create: "Prf", get: "Prf" });
    const { run, auth } = await setupPasskeyAuthWithRun(
      disposer,
      deps,
      createAppName(),
    );
    using uncaughtErrors = testGlobalUncaughtErrors();
    const error = new Error("The listener failed.");
    using _subscription = {
      [Symbol.dispose]: auth.state.subscribe(() => {
        if (auth.state.get().type === "Unlocked") throw error;
      }),
    };

    await auth.unlock();

    assertSame(auth.state.get().type, "Unlocked");
    assertFalse(run.signal.aborted);
    const reported = await uncaughtErrors.settle();
    assertSame(reported.length, 1);
    assertSame(reported[0], error);
  });

  test("starts an unlock whose state listener throws at its start, rather than leaving it Unlocking", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using _provider = setupStubProvider({ create: "Prf", get: "Prf" });
    const { run, auth } = await setupPasskeyAuthWithRun(
      disposer,
      deps,
      createAppName(),
    );
    using uncaughtErrors = testGlobalUncaughtErrors();
    const error = new Error("The listener failed.");
    using _subscription = {
      [Symbol.dispose]: auth.state.subscribe(() => {
        if (auth.state.get().type === "Unlocking") throw error;
      }),
    };

    await auth.unlock();

    assertSame(auth.state.get().type, "Unlocked");
    assertFalse(run.signal.aborted);
    const reported = await uncaughtErrors.settle();
    assertSame(reported.length, 1);
    assertSame(reported[0], error);
  });

  test("finishes a start over whose state listener throws, reports the error, and keeps the root Run", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using _provider = setupStubProvider({ create: "Prf", get: "Refuse" });
    const { run, auth } = await setupPasskeyAuthWithRun(
      disposer,
      deps,
      createAppName(),
    );
    // A retry fails the same way, which offers to forget the pending key.
    await auth.unlock();
    await auth.unlock();
    const offered = auth.state.get();
    assert(
      offered.type === "Failed" && offered.canStartOver,
      "Expected a start over offered.",
    );
    using uncaughtErrors = testGlobalUncaughtErrors();
    const error = new Error("The listener failed.");
    using _subscription = {
      [Symbol.dispose]: auth.state.subscribe(() => {
        if (auth.state.get().type === "Locked") throw error;
      }),
    };

    await auth.startOver({ confirm: () => true });

    assertEqual(auth.state.get(), { type: "Locked", hasDeviceSecret: false });
    assertFalse(run.signal.aborted);
    const reported = await uncaughtErrors.settle();
    assertSame(reported.length, 1);
    assertSame(reported[0], error);
  });

  test("fails without a stored secret when the attempt created a key because another tab forgot the secret", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    const appName = createAppName();
    using provider = setupStubProvider({ create: "Prf", get: "Prf" });
    await (await setupPasskeyAuth(disposer, deps, appName)).unlock();
    const auth = await setupPasskeyAuth(disposer, deps, appName);
    assertEqual(auth.state.get(), { type: "Locked", hasDeviceSecret: true });

    const run = disposer.use(createRun(deps));
    assertOk(await run(forgetWrappedDeviceSecret(appName)));
    provider.behavior.get = "Refuse";
    await auth.unlock();

    // A new passkey's first refusal, which nothing stored can lose.
    assertEqual(auth.state.get(), {
      type: "Failed",
      hasDeviceSecret: false,
      error: { type: "DeviceSecretKeyRefused" },
      canStartOver: false,
      startedOver: false,
    });
    assertSame(provider.create.mock.calls.length, 2);
  });

  test("fails without a stored secret when the creation of a key fails because another tab forgot the secret", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    const appName = createAppName();
    using provider = setupStubProvider({ create: "Prf", get: "Prf" });
    await (await setupPasskeyAuth(disposer, deps, appName)).unlock();
    const auth = await setupPasskeyAuth(disposer, deps, appName);
    assertEqual(auth.state.get(), { type: "Locked", hasDeviceSecret: true });

    const run = disposer.use(createRun(deps));
    assertOk(await run(forgetWrappedDeviceSecret(appName)));
    provider.behavior.create = "Refuse";
    await auth.unlock();

    // A dismissed creation prompt, which nothing stored can lose.
    assertEqual(auth.state.get(), {
      type: "Failed",
      hasDeviceSecret: false,
      error: { type: "DeviceSecretKeyRefused" },
      canStartOver: false,
      startedOver: false,
    });
  });

  test("fails with a stored secret when its passkey doesn't unwrap the secret another tab stored", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    const appName = createAppName();
    using provider = setupStubProvider({ create: "Prf", get: "Prf" });
    const auth = await setupPasskeyAuth(disposer, deps, appName);
    assertEqual(auth.state.get(), { type: "Locked", hasDeviceSecret: false });

    await (await setupPasskeyAuth(disposer, deps, appName)).unlock();
    provider.behavior.get = "OtherPrf";
    await auth.unlock();

    assertEqual(auth.state.get(), {
      type: "Failed",
      hasDeviceSecret: true,
      error: { type: "DeviceSecretUnwrapError" },
      canStartOver: true,
      startedOver: false,
    });
  });

  test("ends an unlock whose prompt is open when disposed, aborting the prompt and changing no state", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    const prompted = Promise.withResolvers<void>();
    // A prompt the user never answers, which ends when its signal aborts, as
    // a browser's does.
    using create = vi.spyOn(navigator.credentials, "create").mockImplementation(
      (options) =>
        new Promise((_resolve, reject) => {
          prompted.resolve();
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted.", "AbortError"));
          });
        }),
    );
    const auth = await setupPasskeyAuth(disposer, deps, createAppName());
    const unlocking = auth.unlock();
    await prompted.promise;
    let notifications = 0;
    auth.state.subscribe(() => {
      notifications++;
    });

    await auth[Symbol.asyncDispose]();
    await unlocking;

    assertTrue(create.mock.calls[0]?.[0]?.signal?.aborted === true);
    assertEqual(auth.state.get(), {
      type: "Unlocking",
      hasDeviceSecret: false,
    });
    assertSame(notifications, 0);
  });

  test("ends a start over that waits for confirmation when disposed, and ignores the late answer", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    const appName = createAppName();
    using provider = setupStubProvider({ create: "Prf", get: "Prf" });
    await (await setupPasskeyAuth(disposer, deps, appName)).unlock();
    provider.behavior.get = "Refuse";
    const auth = await setupPasskeyAuth(disposer, deps, appName);
    await auth.unlock();
    const asked = Promise.withResolvers<void>();
    const answer = Promise.withResolvers<boolean>();

    const startingOver = auth.startOver({
      confirm: () => {
        asked.resolve();
        return answer.promise;
      },
    });
    await asked.promise;
    await auth[Symbol.asyncDispose]();
    await startingOver;
    answer.resolve(true);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    assertEqual(auth.state.get(), {
      type: "StartingOver",
      hasDeviceSecret: true,
    });
    const next = await setupPasskeyAuth(disposer, deps, appName);
    assertEqual(next.state.get(), { type: "Locked", hasDeviceSecret: true });
  });

  test("lets the user unlock again after a dismissed prompt", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using provider = setupStubProvider({ create: "Refuse", get: "Prf" });
    const auth = await setupPasskeyAuth(disposer, deps, createAppName());

    await auth.unlock();
    assertEqual(auth.state.get(), {
      type: "Failed",
      hasDeviceSecret: false,
      error: { type: "DeviceSecretKeyRefused" },
      canStartOver: false,
      startedOver: false,
    });
    provider.behavior.create = "Prf";
    await auth.unlock();

    assertSame(auth.state.get().type, "Unlocked");
  });

  test("doesn't offer a start over after dismissed creation prompts, which leave no key to forget", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using provider = setupStubProvider({ create: "Refuse", get: "Prf" });
    const auth = await setupPasskeyAuth(disposer, deps, createAppName());
    const refused = {
      type: "Failed",
      hasDeviceSecret: false,
      error: { type: "DeviceSecretKeyRefused" },
      canStartOver: false,
      startedOver: false,
    } as const;

    await auth.unlock();
    assertEqual(auth.state.get(), refused);
    await auth.unlock();
    assertEqual(auth.state.get(), refused);
    assertSame(provider.create.mock.calls.length, 2);
  });

  test("doesn't count a failed attempt that created the passkey as a retry, as Safari refuses the prompt that follows a passkey's creation outside a click", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using provider = setupStubProvider({ create: "Refuse", get: "Refuse" });
    const auth = await setupPasskeyAuth(disposer, deps, createAppName());
    const refused = (canStartOver: boolean) =>
      ({
        type: "Failed",
        hasDeviceSecret: false,
        error: { type: "DeviceSecretKeyRefused" },
        canStartOver,
        startedOver: false,
      }) as const;

    await auth.unlock();
    assertEqual(auth.state.get(), refused(false));
    // This attempt creates the passkey, then the prompt to get its key fails.
    provider.behavior.create = "Prf";
    await auth.unlock();
    assertEqual(auth.state.get(), refused(false));
    await auth.unlock();
    assertEqual(auth.state.get(), refused(true));
  });

  test("is NotPersisted, without a passkey, where the browser keeps nothing", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using provider = setupStubProvider({ create: "Prf", get: "Prf" });
    const auth = await setupPasskeyAuth(disposer, deps, createAppName(), () =>
      Promise.resolve("NotPersisted"),
    );

    assertEqual(auth.state.get(), { type: "NotPersisted" });
    assertThrowsInstanceOf(() => auth.unlock(), Error);
    assertSame(provider.create.mock.calls.length, 0);
  });

  test("panics in an unlock with deps whose getDevicePersistence changed its answer since the start", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    using provider = setupStubProvider({ create: "Prf", get: "Prf" });
    let devicePersistence: DevicePersistence = "Unknown";
    // It records the defects reported.
    const run = disposer.use(
      testCreateRun({
        ...deps,
        getDevicePersistence: () => Promise.resolve(devicePersistence),
      }),
    );
    const auth = disposer.use(
      await run.orThrow(
        createPasskeyAuth({
          appName: createAppName(),
          rpName: "Evolu",
          userName: "Device",
        }),
      ),
    );

    // Not as createEvoluDeps', whose answer stays the same.
    devicePersistence = "NotPersisted";
    await auth.unlock();

    const [defect] = run.deps.reportDefect.getDefects();
    assertTrue(AbortError.is(defect));
    const { reason } = defect;
    assertTrue(
      reason.type === "PanicAbortReason" &&
        reason.defect instanceof Error &&
        reason.defect.message.includes(
          "getDevicePersistence answers the same for the deps' lifetime",
        ),
    );
    assertSame(provider.create.mock.calls.length, 0);
  });

  test("ends its creation when its Run is disposed while reading whether the browser keeps data", async () => {
    await using disposer = new AsyncDisposableStack();
    const deps = await setupDeps(disposer);
    const run = createRun({
      ...deps,
      getDevicePersistence: () => new Promise<DevicePersistence>(constVoid),
    });

    const fiber = run.abortable(
      createPasskeyAuth({
        appName: createAppName(),
        rpName: "Evolu",
        userName: "Device",
      }),
    );
    await run[Symbol.asyncDispose]();

    const result = await fiber;
    assert(!result.ok, "Expected the creation to end.");
    assertSame(result.error.type, "AbortError");
  });

  // Vitest's Playwright provider exposes CDP only for Chromium.
  describe.skipIf(server.browser !== "chromium")(
    "with a virtual authenticator",
    () => {
      test("unlocks with PRF, and unlocks the same secret at the next start", async () => {
        await using disposer = new AsyncDisposableStack();
        await setupVirtualAuthenticator(disposer);
        const deps = await setupDeps(disposer);
        const appName = createAppName();

        const auth = await setupPasskeyAuth(disposer, deps, appName);
        await auth.unlock();
        const unlocked = auth.state.get();
        assert(unlocked.type === "Unlocked", "Expected the secret.");
        const next = await setupPasskeyAuth(disposer, deps, appName);
        await next.unlock();

        assertEqual(next.state.get(), unlocked);
      });

      test("fails as unavailable without PRF, which Chrome reports at registration too", async () => {
        await using disposer = new AsyncDisposableStack();
        await setupVirtualAuthenticator(disposer, false);
        const deps = await setupDeps(disposer);

        const auth = await setupPasskeyAuth(disposer, deps, createAppName());
        await auth.unlock();

        assertEqual(auth.state.get(), {
          type: "Failed",
          hasDeviceSecret: false,
          error: { type: "DeviceSecretKeyUnavailable" },
          canStartOver: false,
          startedOver: false,
        });
      });
    },
  );
});
