import { test } from "node:test";
import { assertEqual } from "./Assert.ts";
import { utf8ToBytes } from "./Bytes.ts";
import { fnv1a32 } from "./Hash.ts";

test("fnv1a32 matches the published FNV-1a test vectors", () => {
  for (const [text, hash] of [
    ["", 0x811c9dc5],
    ["a", 0xe40c292c],
    ["foobar", 0xbf9cf968],
  ] as const) {
    assertEqual(fnv1a32(utf8ToBytes(text)), hash);
  }
});

test("fnv1a32 returns an unsigned 32-bit integer", () => {
  const hash = fnv1a32(new Uint8Array([0xff, 0x00, 0x80]));

  assertEqual(hash >>> 0, hash);
  assertEqual(hash, 0xa36cd47e);
});

test("fnv1a32 continues from a previous hash", () => {
  const parts = [utf8ToBytes("local"), new Uint8Array(), utf8ToBytes("-first")];
  let hash: number | undefined;
  for (const part of parts) hash = fnv1a32(part, hash);

  assertEqual(hash, fnv1a32(utf8ToBytes("local-first")));
});
