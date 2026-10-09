import { describe, it } from "vitest";
import {
  assertEqual,
  assertEqualBytes,
  assertFalse,
  assertTrue,
} from "../../../../packages/common/src/Assert.ts";
import {
  Base64,
  base64ToUint8Array,
  base64UrlToUint8Array,
  uint8ArrayToBase64,
  uint8ArrayToBase64Url,
} from "../../../../packages/common/src/Type.ts";

const withoutNativeBase64 = (callback: () => void): void => {
  const toBase64Descriptor = Object.getOwnPropertyDescriptor(
    Uint8Array.prototype,
    "toBase64",
  );
  const fromBase64Descriptor = Object.getOwnPropertyDescriptor(
    Uint8Array,
    "fromBase64",
  );

  try {
    assertTrue(Reflect.deleteProperty(Uint8Array.prototype, "toBase64"));
    assertTrue(Reflect.deleteProperty(Uint8Array, "fromBase64"));
    callback();
  } finally {
    if (toBase64Descriptor !== undefined) {
      // oxlint-disable-next-line eslint/no-extend-native -- The test restores the native method it temporarily removes.
      Object.defineProperty(
        Uint8Array.prototype,
        "toBase64",
        toBase64Descriptor,
      );
    }
    if (fromBase64Descriptor !== undefined) {
      Object.defineProperty(Uint8Array, "fromBase64", fromBase64Descriptor);
    }
  }
};

describe("Base64Url", () => {
  it("round-trips bytes with the platform Base64 implementation", () => {
    for (const bytes of [
      new Uint8Array(),
      new Uint8Array([0]),
      new Uint8Array([255]),
      new Uint8Array([72, 101, 108, 108, 111]),
    ]) {
      const encoded = uint8ArrayToBase64Url(bytes);
      assertEqualBytes(base64UrlToUint8Array(encoded), bytes);
    }
  });

  it("falls back to btoa and atob", () => {
    withoutNativeBase64(() => {
      const bytes = new Uint8Array([251, 255]);
      const encoded = uint8ArrayToBase64Url(bytes);

      assertEqual(encoded, "-_8");
      assertEqualBytes(base64UrlToUint8Array(encoded), bytes);
    });
  });
});

describe("Base64", () => {
  const checkBase64 = (): void => {
    for (const bytes of [
      new Uint8Array(),
      new Uint8Array([0]),
      new Uint8Array([251, 255]),
      new Uint8Array([72, 101, 108, 108, 111]),
    ]) {
      const encoded = uint8ArrayToBase64(bytes);
      assertTrue(Base64.is(encoded));
      assertEqualBytes(base64ToUint8Array(encoded), bytes);
    }
    assertEqual(uint8ArrayToBase64(new Uint8Array([251, 255])), "+/8=");
    assertTrue(Base64.is("AAAA"));
    for (const value of ["AB==", "AA", "-_-_", " AAAA"]) {
      assertFalse(Base64.is(value));
    }
  };

  it("round-trips canonical text with the platform Base64 implementation", () => {
    checkBase64();
  });

  it("round-trips canonical text with btoa and atob", () => {
    withoutNativeBase64(checkBase64);
  });
});
