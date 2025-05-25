import { expect, test } from "vitest";
import { createRandom } from "../src/Random.js";
import { createSkiplist, createSkiplistLevel } from "../src/Skiplist.js";

const numbersAsc = Array.from({ length: 100 }, (_, i) => i);
const numbersDesc = numbersAsc.toReversed();
const numbersRandom = numbersAsc.slice().sort(() => Math.random() - 0.5);

const skiplistLevel = createSkiplistLevel({ random: createRandom() })();
const deps = { skiplistLevel };

const testNumbers = (numbers: Array<number>) => {
  const s = performance.now();
  const list = createSkiplist(deps);
  for (const n of numbers) {
    list.insert(n);
  }
  const e = performance.now() - s;
  for (const n of numbers) {
    expect(list.find(n)?.key).toBe(n);
  }
  return e;
};

test("asc", () => {
  const _time = testNumbers(numbersAsc);
  // For 100k, 52
  // console.log(time);
});

test("desc", () => {
  const _time = testNumbers(numbersDesc);
  // For 100k, 25
  // console.log(time);
});

test("random", () => {
  const _time = testNumbers(numbersRandom);
  // For 100k, 66
  // console.log(time);
});
