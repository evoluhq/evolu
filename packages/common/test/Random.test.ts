import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createRandom,
  createRandomLib,
  testCreateRandom,
  testCreateRandomLib,
} from "../src/Random.ts";

const { randomLibConstructor, randomLibNext } = vi.hoisted(() => ({
  randomLibConstructor: vi.fn(),
  randomLibNext: vi.fn(),
}));

vi.mock("random", () => ({
  Random: class {
    constructor(seed?: string) {
      if (seed === undefined) randomLibConstructor();
      else randomLibConstructor(seed);
    }

    next = randomLibNext;
  },
}));

describe("Random", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  test("createRandom delegates to Math.random", () => {
    const mathRandom = vi.spyOn(Math, "random").mockReturnValue(0.25);

    expect(createRandom().next()).toBe(0.25);
    expect(mathRandom).toHaveBeenCalledOnce();
  });

  test("testCreateRandom constructs RandomLib with the default seed", () => {
    testCreateRandom();

    expect(randomLibConstructor).toHaveBeenCalledExactlyOnceWith("evolu");
  });

  test("testCreateRandom constructs RandomLib with a custom seed", () => {
    testCreateRandom("test");

    expect(randomLibConstructor).toHaveBeenCalledExactlyOnceWith("test");
  });

  test("testCreateRandom delegates next to RandomLib", () => {
    randomLibNext.mockReturnValue(0.25);

    expect(testCreateRandom().next()).toBe(0.25);
    expect(randomLibNext).toHaveBeenCalledOnce();
  });

  test("createRandomLib constructs RandomLib without a seed", () => {
    createRandomLib();

    expect(randomLibConstructor).toHaveBeenCalledOnce();
    expect(randomLibConstructor).toHaveBeenCalledWith();
  });

  test("testCreateRandomLib constructs RandomLib with the default seed", () => {
    testCreateRandomLib();

    expect(randomLibConstructor).toHaveBeenCalledExactlyOnceWith("evolu");
  });

  test("testCreateRandomLib constructs RandomLib with a custom seed", () => {
    testCreateRandomLib("test");

    expect(randomLibConstructor).toHaveBeenCalledExactlyOnceWith("test");
  });
});
