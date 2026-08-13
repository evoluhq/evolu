import { test } from "vitest";
import { testEvoluJSDocExamples } from "../../../../scripts/test-jsdoc.mts";

test("Evolu JSDoc examples compile and run", async () => {
  await testEvoluJSDocExamples();
}, 300000);
