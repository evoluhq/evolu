import { expect, test } from "vitest";
import { isHermes, isServer } from "../src/Platform.js";

test("isServer matches environment", () => {
  expect(isServer).toBe(typeof document === "undefined");
});

test("isHermes is false in test environment", () => {
  expect(isHermes).toBe(false);
});
