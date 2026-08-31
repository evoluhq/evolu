import { afterEach, describe, it, mock } from "node:test";
import { assertEqual } from "./Assert.ts";

const randomLibConstructor = mock.fn<(seed?: string) => void>();
const randomLibNext = mock.fn<() => number>();

mock.module("random", {
  // @ts-expect-error -- Node.js 24.20 replaces the deprecated namedExports option with exports, which @types/node 24.13 does not declare yet.
  exports: {
    Random: class {
      next = randomLibNext;

      constructor(seed?: string) {
        if (seed === undefined) randomLibConstructor();
        else randomLibConstructor(seed);
      }
    },
  },
});

const { createRandom, createRandomLib, testCreateRandom, testCreateRandomLib } =
  await import("./Random.ts");

describe("Random", () => {
  afterEach(() => {
    mock.restoreAll();
    randomLibConstructor.mock.resetCalls();
    randomLibNext.mock.resetCalls();
  });

  it("createRandom delegates to Math.random", () => {
    const mathRandom = mock.method(Math, "random", () => 0.25);

    assertEqual(createRandom().next(), 0.25);
    assertEqual(mathRandom.mock.callCount(), 1);
  });

  it("testCreateRandom constructs RandomLib with the default seed", () => {
    testCreateRandom();

    assertEqual(
      randomLibConstructor.mock.calls.map(({ arguments: args }) => args),
      [["evolu"]],
    );
  });

  it("testCreateRandom constructs RandomLib with a custom seed", () => {
    testCreateRandom("test");

    assertEqual(
      randomLibConstructor.mock.calls.map(({ arguments: args }) => args),
      [["test"]],
    );
  });

  it("testCreateRandom delegates next to RandomLib", () => {
    randomLibNext.mock.mockImplementation(() => 0.25);

    assertEqual(testCreateRandom().next(), 0.25);
    assertEqual(randomLibNext.mock.callCount(), 1);
  });

  it("createRandomLib constructs RandomLib without a seed", () => {
    createRandomLib();

    assertEqual(
      randomLibConstructor.mock.calls.map(({ arguments: args }) => args),
      [[]],
    );
  });

  it("testCreateRandomLib constructs RandomLib with the default seed", () => {
    testCreateRandomLib();

    assertEqual(
      randomLibConstructor.mock.calls.map(({ arguments: args }) => args),
      [["evolu"]],
    );
  });

  it("testCreateRandomLib constructs RandomLib with a custom seed", () => {
    testCreateRandomLib("test");

    assertEqual(
      randomLibConstructor.mock.calls.map(({ arguments: args }) => args),
      [["test"]],
    );
  });
});
