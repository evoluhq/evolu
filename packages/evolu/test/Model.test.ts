import * as Schema from "@effect/schema/Schema";
import { Either } from "effect";
import { expect, test } from "vitest";
import { String } from "../src/Model.js";

test("String", () => {
  expect(Either.isRight(Schema.parseEither(String)(""))).toBe(true);
  expect(Either.isRight(Schema.parseEither(String)("a"))).toBe(true);
  expect(Either.isRight(Schema.parseEither(String)("["))).toBe(true);
  expect(Either.isRight(Schema.parseEither(String)("{"))).toBe(true);
  expect(Either.isLeft(Schema.parseEither(String)("[]"))).toBe(true);
  expect(Either.isLeft(Schema.parseEither(String)("{}"))).toBe(true);
});
