import { assertFalse, assertTrue } from "@evolu/common";
import { describe, it } from "node:test";
import { createTimingSafeEqual } from "./Crypto.ts";

describe("createTimingSafeEqual", () => {
  const timingSafeEqual = createTimingSafeEqual();

  it("returns true for equal arrays", () => {
    assertTrue(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])));
  });

  it("returns false for different arrays of the same length", () => {
    assertFalse(
      timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])),
    );
  });

  it("returns false for arrays of different lengths", () => {
    assertFalse(
      timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])),
    );
  });
});
