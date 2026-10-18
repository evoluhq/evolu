import { assertEqual } from "@evolu/common";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import {
  generatedEnd,
  generatedStart,
  generateXChaChaVectors,
  xchachaTestFile,
} from "./xchacha-vectors.mts";

it("keeps the XChaCha20-Poly1305 vectors of xchacha_test.c generated from Evolu's TypeScript", () => {
  const source = readFileSync(xchachaTestFile, "utf8");
  const start = source.indexOf(generatedStart);
  const end = source.indexOf(generatedEnd);

  assertEqual(
    start === -1 || end < start
      ? null
      : source.slice(start, end + generatedEnd.length),
    generateXChaChaVectors(),
  );
});
