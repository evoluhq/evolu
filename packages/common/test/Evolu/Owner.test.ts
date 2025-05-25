import { expect, test } from "vitest";
import { createOwner, createWriteKey } from "../../src/index.js";
import {
  testCreateMnemonic,
  testCreateRandomBytesDep,
  testMnemonic,
  testMnemonicSeed,
  testTime,
} from "../_deps.js";

test("createOwner", () => {
  const owner = createOwner({
    createMnemonic: testCreateMnemonic,
    ...testCreateRandomBytesDep,
    time: testTime,
  })(testMnemonic);
  expect(owner).toMatchSnapshot();
});

test("createWriteKey", () => {
  const key = createWriteKey(testCreateRandomBytesDep)(testMnemonicSeed);
  expect(key).toMatchSnapshot();
});
