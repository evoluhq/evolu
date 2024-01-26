import * as S from "@effect/schema/Schema";
import { Either } from "effect";
import { expect, test } from "vitest";
import { String } from "../src/Model.js";

test("String", () => {
  expect(Either.isRight(S.decodeEither(String)(""))).toBe(true);
  expect(Either.isRight(S.decodeEither(String)("a"))).toBe(true);
  expect(Either.isRight(S.decodeEither(String)("["))).toBe(true);
  expect(Either.isRight(S.decodeEither(String)("{"))).toBe(true);
  expect(Either.isLeft(S.decodeEither(String)("[]"))).toBe(true);
  expect(Either.isLeft(S.decodeEither(String)("{}"))).toBe(true);
});
