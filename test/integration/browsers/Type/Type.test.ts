import { describe, it } from "vitest";
import {
  assertEqual,
  assertEqualBytes,
  assertTrue,
} from "../../../../packages/common/src/Assert.ts";
import {
  base64UrlToUint8Array,
  uint8ArrayToBase64Url,
} from "../../../../packages/common/src/Type.ts";

describe("Base64Url", () => {
  it("round-trips bytes with the platform Base64 implementation", () => {
    for (const bytes of [
      new globalThis.Uint8Array(),
      new globalThis.Uint8Array([0]),
      new globalThis.Uint8Array([255]),
      new globalThis.Uint8Array([72, 101, 108, 108, 111]),
    ]) {
      const encoded = uint8ArrayToBase64Url(bytes);
      assertEqualBytes(base64UrlToUint8Array(encoded), bytes);
    }
  });

  it("falls back to btoa and atob", () => {
    const toBase64Descriptor = globalThis.Object.getOwnPropertyDescriptor(
      globalThis.Uint8Array.prototype,
      "toBase64",
    );
    const fromBase64Descriptor = globalThis.Object.getOwnPropertyDescriptor(
      globalThis.Uint8Array,
      "fromBase64",
    );

    try {
      assertTrue(
        Reflect.deleteProperty(globalThis.Uint8Array.prototype, "toBase64"),
      );
      assertTrue(Reflect.deleteProperty(globalThis.Uint8Array, "fromBase64"));

      const bytes = new globalThis.Uint8Array([251, 255]);
      const encoded = uint8ArrayToBase64Url(bytes);

      assertEqual(encoded, "-_8");
      assertEqualBytes(base64UrlToUint8Array(encoded), bytes);
    } finally {
      if (toBase64Descriptor !== undefined) {
        globalThis.Object.defineProperty(
          globalThis.Uint8Array.prototype,
          "toBase64",
          toBase64Descriptor,
        );
      }
      if (fromBase64Descriptor !== undefined) {
        globalThis.Object.defineProperty(
          globalThis.Uint8Array,
          "fromBase64",
          fromBase64Descriptor,
        );
      }
    }
  });
});
