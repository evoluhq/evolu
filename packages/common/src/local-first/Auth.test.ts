import { test } from "node:test";
import {
  assertEqual,
  assertErr,
  assertFalse,
  assertNotEqual,
  assertOk,
  assertTrue,
} from "../Assert.ts";
import { Entropy24, Entropy32 } from "../Crypto.ts";
import { eqData } from "../Eq.ts";
import { testCreateDeps } from "../Task.ts";
import { Uint8ArrayFromHex } from "../Type.ts";
import {
  createDeviceSecret,
  DeviceSecret,
  DeviceSecretKeyId,
  unwrapDeviceSecret,
  wrapDeviceSecret,
  WrappedDeviceSecret,
} from "./Auth.ts";

test("createDeviceSecret creates 32 random bytes", () => {
  const secret = createDeviceSecret(testCreateDeps());

  assertTrue(DeviceSecret.is(secret));
  assertEqual(secret.length, 32);
  assertFalse(
    eqData(secret, createDeviceSecret(testCreateDeps({ seed: "device-2" }))),
  );
});

test("DeviceSecret rejects 32 zero bytes, instant start's public secret", () => {
  assertErr(DeviceSecret.fromUnknown(new Uint8Array(32)), {
    type: "DeviceSecret",
  });
  assertOk(DeviceSecret.fromUnknown(new Uint8Array(32).fill(1)));
  assertOk(
    DeviceSecret.fromUnknown(new Uint8Array(32).fill(0, 0, 31).fill(1, 31)),
  );

  // The message leaves the value out, as a secret's error should.
  const zero = DeviceSecret.fromUnknown(new Uint8Array(32));
  assertFalse(zero.ok);
  assertEqual(
    DeviceSecret.formatError(zero.error),
    "32 zero bytes are instant start's public secret, not a DeviceSecret. Create one with createDeviceSecret.",
  );
});

test("DeviceSecretKeyId takes 1 to 1023 bytes, as WebAuthn allows", () => {
  assertOk(DeviceSecretKeyId.fromUnknown(new Uint8Array([1])));
  assertOk(DeviceSecretKeyId.fromUnknown(new Uint8Array(1023)));
  assertErr(DeviceSecretKeyId.fromUnknown(new Uint8Array(0)));
  assertErr(DeviceSecretKeyId.fromUnknown(new Uint8Array(1024)));
});

test("WrappedDeviceSecret takes exactly 72 bytes", () => {
  assertOk(WrappedDeviceSecret.fromUnknown(new Uint8Array(72)));
  assertErr(WrappedDeviceSecret.fromUnknown(new Uint8Array(71)));
  assertErr(WrappedDeviceSecret.fromUnknown(new Uint8Array(73)));
});

test("wrapDeviceSecret writes the v1 format, which unwrapDeviceSecret reads", ({
  mock,
}) => {
  const secret = DeviceSecret.orThrow(new Uint8Array(32).fill(0x11));
  const key = Entropy32.orThrow(new Uint8Array(32).fill(0x22));
  const nonce = Entropy24.orThrow(new Uint8Array(24).fill(0x33));
  // The v1 format is permanent once shipped.
  const wrapped = WrappedDeviceSecret.orThrow(
    Uint8ArrayFromHex.orThrow(
      "333333333333333333333333333333333333333333333333" +
        "c966e6388bbbd59931cc95f4164315b01163997555647084167525a9a59aaf006" +
        "05ab7f7c7fc26c90fa2434cbc410d78",
    ),
  );
  const deps = testCreateDeps();
  mock.method(deps.randomBytes, "create", () => nonce);

  assertEqual(wrapDeviceSecret(deps)(secret, key), wrapped);
  assertOk(unwrapDeviceSecret(wrapped, key), secret);
});

test("unwrapDeviceSecret refuses a wrapped zero secret, instant start's public one", () => {
  const deps = testCreateDeps();
  const key = Entropy32.orThrow(new Uint8Array(32).fill(0x22));
  const wrapped = wrapDeviceSecret(deps)(
    new Uint8Array(32) as DeviceSecret,
    key,
  );

  assertErr(unwrapDeviceSecret(wrapped, key), {
    type: "DeviceSecretUnwrapError",
  });
});

test("wrapDeviceSecret uses a fresh nonce for every wrap", () => {
  const deps = testCreateDeps();
  const secret = createDeviceSecret(deps);
  const key = deps.randomBytes.create(32);
  const first = wrapDeviceSecret(deps)(secret, key);
  const second = wrapDeviceSecret(deps)(secret, key);

  assertNotEqual(first.subarray(0, 24), second.subarray(0, 24));
  assertOk(unwrapDeviceSecret(first, key), secret);
  assertOk(unwrapDeviceSecret(second, key), secret);
});

test("unwrapDeviceSecret rejects another key and changed bytes", () => {
  const deps = testCreateDeps();
  const key = deps.randomBytes.create(32);
  const wrapped = wrapDeviceSecret(deps)(createDeviceSecret(deps), key);

  assertErr(unwrapDeviceSecret(wrapped, deps.randomBytes.create(32)), {
    type: "DeviceSecretUnwrapError",
  });
  const changed = new Uint8Array(wrapped);
  changed[71] ^= 1;
  assertErr(unwrapDeviceSecret(WrappedDeviceSecret.orThrow(changed), key), {
    type: "DeviceSecretUnwrapError",
  });
});
