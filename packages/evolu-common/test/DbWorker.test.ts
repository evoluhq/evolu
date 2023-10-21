import { expect, test } from "vitest";
import {
  MutateItem,
  OnCompleteId,
  mutateItemsToNewMessages,
} from "../src/DbWorker.js";
import { Id, cast } from "../src/Model.js";

test("mutateItemsToNewMessages should dedupe", () => {
  const item: MutateItem = {
    table: "table",
    id: "id" as Id,
    values: { a: 1, b: true },
    isInsert: true,
    now: cast(new Date()),
    onCompleteId: "onCompleteId" as OnCompleteId,
  };
  const length = mutateItemsToNewMessages([item, item]).length;
  expect(length).toBe(3);
});
