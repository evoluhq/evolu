import {
  AbortError,
  AppName,
  assertEqual,
  assertErr,
  assertFalse,
  assertOk,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
  createUnknownError,
  eqUint8Array,
  testCreateRun,
  uint8ArrayToBase64Url,
} from "@evolu/common";
import { beforeEach, mock, test } from "node:test";
import { setTimeout } from "node:timers/promises";

/** The secure storage of the fake EvoluApp, by app name. */
const storedByAppName = new Map<string, string>();
let nextFailure: Error | null = null;
/** An answer the test settles, instead of the storage's. */
let nextAnswer: Promise<string> | null = null;

const getOrAddDeviceSecret = (appName: string, secret: string) => {
  const failure = nextFailure;
  nextFailure = null;
  if (failure !== null) return Promise.reject(failure);
  const answer = nextAnswer;
  nextAnswer = null;
  if (answer !== null) return answer;
  if (!storedByAppName.has(appName)) storedByAppName.set(appName, secret);
  return Promise.resolve(storedByAppName.get(appName));
};
let nextForgetFailure: Error | null = null;

const forgetDeviceSecret = (appName: string) => {
  const failure = nextForgetFailure;
  nextForgetFailure = null;
  if (failure !== null) return Promise.reject(failure);
  storedByAppName.delete(appName);
  return Promise.resolve();
};

/** The native module, whose methods a test can remove, as an older build has. */
const nativeEvoluApp: {
  getOrAddDeviceSecret?: typeof getOrAddDeviceSecret;
  forgetDeviceSecret?: typeof forgetDeviceSecret;
} = { getOrAddDeviceSecret, forgetDeviceSecret };

// The specs import React Native, which Node.js can't load.
mock.module(new URL("./specs/NativeEvoluApp.ts", import.meta.url).href, {
  exports: { default: nativeEvoluApp },
});

mock.module(new URL("./specs/NativeEvoluSqlite.ts", import.meta.url).href, {
  exports: { default: null },
});

const { forgetDeviceSecret: forget, loadDeviceSecret } =
  await import("./DeviceSecret.ts");

// Fresh for each test, which run in random order.
beforeEach(() => {
  nativeEvoluApp.getOrAddDeviceSecret = getOrAddDeviceSecret;
  nativeEvoluApp.forgetDeviceSecret = forgetDeviceSecret;
  storedByAppName.clear();
  nextFailure = null;
  nextForgetFailure = null;
  nextAnswer = null;
});

const appName = AppName.orThrow("device-secret-test");

test("stores a new DeviceSecret on first use and loads the same one later", async () => {
  await using run = testCreateRun();

  const created = await run(loadDeviceSecret(appName));
  const loaded = await run(loadDeviceSecret(appName));

  assertOk(created);
  assertEqual(created.value.length, 32);
  assertEqual(loaded, created);
  assertEqual([...storedByAppName.keys()], [appName]);
});

test("reports secure storage that can't be read yet", async () => {
  await using run = testCreateRun();
  nextFailure = Object.assign(new Error("Locked."), { code: "Unavailable" });

  assertErr(await run(loadDeviceSecret(appName)), {
    type: "DeviceSecretStorageUnavailable",
  });
});

test("reports other failures and invalid stored values as UnknownError", async () => {
  await using run = testCreateRun();
  const otherApp = AppName.orThrow("device-secret-invalid");

  // Every native failure has a code: Keystore on Android, Keychain on iOS.
  for (const code of [undefined, "Keystore", "Keychain"]) {
    nextFailure = Object.assign(new Error("Failed."), { code });
    const failed = await run(loadDeviceSecret(appName));
    assertErr(failed);
    assertSame(failed.error.type, "UnknownError");
  }
  // Nor a failure without one, an Error or not.
  for (const fail of [
    () => Promise.reject(new Error("Failed.")),
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- A native module can reject with any value.
    () => Promise.reject("Failed."),
  ]) {
    nextAnswer = fail();
    const failed = await run(loadDeviceSecret(appName));
    assertErr(failed);
    assertSame(failed.error.type, "UnknownError");
  }

  // Not base64url, base64url of 31 bytes, and of 32 zero bytes, instant
  // start's public secret. The error leaves the value out.
  for (const stored of [
    "not 32 bytes",
    uint8ArrayToBase64Url(new Uint8Array(31).fill(1)),
    uint8ArrayToBase64Url(new Uint8Array(32)),
  ]) {
    storedByAppName.set(otherApp, stored);
    assertErr(
      await run(loadDeviceSecret(otherApp)),
      createUnknownError("The stored DeviceSecret isn't valid."),
    );
  }
});

test("throws on a native build without the method, as an over-the-air update can run on", () => {
  delete nativeEvoluApp.getOrAddDeviceSecret;

  // A build error, as a missing module is, not a storage failure.
  const error = assertThrowsInstanceOf(() => loadDeviceSecret(appName), Error);
  assertTrue(
    error.message.startsWith(
      "Evolu's native method EvoluApp.getOrAddDeviceSecret isn't in this native build.",
    ),
  );
  assertTrue(error.message.includes("Rebuild the native app"));
});

test("ends at once when aborted, without the native answer", async () => {
  await using run = testCreateRun();
  const answer = Promise.withResolvers<string>();
  nextAnswer = answer.promise;

  const fiber = run.abortable(loadDeviceSecret(appName));
  let settled = false;
  void fiber.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assertFalse(settled);
  fiber.abort();
  await setTimeout(0);
  const settledBeforeAnswer = settled;
  // The native get-or-add still completes, and its answer changes nothing.
  answer.resolve("A".repeat(43));
  const result = await fiber;

  assertTrue(settledBeforeAnswer);
  assertErr(result);
  assertTrue(AbortError.is(result.error));
});

test("hands a failure it can't read to the Run as a defect", async () => {
  await using run = testCreateRun();
  const defect = new Error("Unreadable.");
  nextFailure = Object.defineProperty(new Error("Failed."), "code", {
    get: () => {
      throw defect;
    },
  });

  assertEqual(
    await run(loadDeviceSecret(appName)).then(
      () => null,
      (error: unknown) => error,
    ),
    { type: "AbortError", reason: { type: "PanicAbortReason", defect } },
  );
});

test("reports a stored DeviceSecret the storage can't read as DeviceSecretUnreadable", async () => {
  await using run = testCreateRun();
  // Android's code for a lost Keystore key or a record that fails
  // authentication.
  nextFailure = Object.assign(new Error("Unreadable."), { code: "Unreadable" });

  assertErr(await run(loadDeviceSecret(appName)), {
    type: "DeviceSecretUnreadable",
  });
});

test("forgetDeviceSecret deletes the stored DeviceSecret, so the next load creates another", async () => {
  await using run = testCreateRun();
  const otherApp = AppName.orThrow("device-secret-other");
  const first = await run(loadDeviceSecret(appName));
  const other = await run(loadDeviceSecret(otherApp));
  assertOk(first);
  assertOk(other);

  assertOk(await run(forget(appName)));
  const created = await run(loadDeviceSecret(appName));

  assertOk(created);
  assertEqual(created.value.length, 32);
  assertFalse(eqUint8Array(created.value, first.value));
  // Only that app name's.
  assertEqual(await run(loadDeviceSecret(otherApp)), other);
});

test("forgetDeviceSecret reports a native failure as UnknownError", async () => {
  await using run = testCreateRun();
  nextForgetFailure = Object.assign(new Error("Failed."), { code: "Keystore" });

  const forgotten = await run(forget(appName));
  assertErr(forgotten);
  assertSame(forgotten.error.type, "UnknownError");
});

test("forgetDeviceSecret throws on a native build without the method", () => {
  delete nativeEvoluApp.forgetDeviceSecret;

  const error = assertThrowsInstanceOf(() => forget(appName), Error);
  assertTrue(
    error.message.startsWith(
      "Evolu's native method EvoluApp.forgetDeviceSecret isn't in this native build.",
    ),
  );
});
