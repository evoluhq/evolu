import * as S from "@effect/schema/Schema";
import { Either } from "effect";
import { expect, test } from "vitest";
import { String } from "../src/Model.js";

test("String", () => {
  expect(Either.isRight(S.parseEither(String)(""))).toBe(true);
  expect(Either.isRight(S.parseEither(String)("a"))).toBe(true);
  expect(Either.isRight(S.parseEither(String)("["))).toBe(true);
  expect(Either.isRight(S.parseEither(String)("{"))).toBe(true);
  expect(Either.isLeft(S.parseEither(String)("[]"))).toBe(true);
  expect(Either.isLeft(S.parseEither(String)("{}"))).toBe(true);
});
