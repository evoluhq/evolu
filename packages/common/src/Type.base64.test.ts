import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { assertEqualBytes, assertEqual, assertTrue } from "./Assert.ts";

const toBase64Descriptor = Object.getOwnPropertyDescriptor(
  Uint8Array.prototype,
  "toBase64",
);
const fromBase64Descriptor = Object.getOwnPropertyDescriptor(
  Uint8Array,
  "fromBase64",
);

mock.module("./Platform.ts", {
  // @ts-expect-error -- Node.js 24.20 replaces the deprecated namedExports option with exports, which @types/node 24.13 does not declare yet.
  exports: { hasNodeBuffer: false },
});

const { base64UrlToUint8Array, uint8ArrayToBase64Url } =
  await import("./Type.ts");

const restoreBase64Methods = (): void => {
  if (toBase64Descriptor === undefined) {
    Reflect.deleteProperty(Uint8Array.prototype, "toBase64");
  } else {
    // oxlint-disable-next-line eslint/no-extend-native -- The test restores the native method it temporarily replaces.
    Object.defineProperty(Uint8Array.prototype, "toBase64", toBase64Descriptor);
  }

  if (fromBase64Descriptor === undefined) {
    Reflect.deleteProperty(Uint8Array, "fromBase64");
  } else {
    Object.defineProperty(Uint8Array, "fromBase64", fromBase64Descriptor);
  }
};

describe("Base64Url browser implementations", () => {
  beforeEach(() => {
    assertTrue(Reflect.deleteProperty(Uint8Array.prototype, "toBase64"));
    assertTrue(Reflect.deleteProperty(Uint8Array, "fromBase64"));
  });

  afterEach(() => {
    restoreBase64Methods();
  });

  it("uses Uint8Array Base64 methods when available", () => {
    // oxlint-disable-next-line eslint/no-extend-native -- The test installs the native API to exercise its code path.
    Object.defineProperty(Uint8Array.prototype, "toBase64", {
      configurable: true,
      value(this: Uint8Array, options: unknown): string {
        assertEqual(options, { alphabet: "base64url", omitPadding: true });
        return Buffer.from(this).toString("base64url");
      },
    });
    Object.defineProperty(Uint8Array, "fromBase64", {
      configurable: true,
      value(value: string, options: unknown): Uint8Array {
        assertEqual(options, { alphabet: "base64url", omitPadding: true });
        return new Uint8Array(Buffer.from(value, "base64url"));
      },
    });

    const bytes = new Uint8Array([251, 255]);
    const encoded = uint8ArrayToBase64Url(bytes);

    assertEqual(encoded, "-_8");
    assertEqualBytes(base64UrlToUint8Array(encoded), bytes);
  });

  it("uses btoa and atob when Uint8Array Base64 methods are unavailable", () => {
    for (const bytes of [
      new Uint8Array(),
      new Uint8Array([0]),
      new Uint8Array([0, 1]),
      new Uint8Array([0, 1, 2]),
      new Uint8Array([251, 255]),
    ]) {
      const encoded = uint8ArrayToBase64Url(bytes);
      assertEqualBytes(base64UrlToUint8Array(encoded), bytes);
    }

    assertEqual(uint8ArrayToBase64Url(new Uint8Array([251, 255])), "-_8");
  });
});
