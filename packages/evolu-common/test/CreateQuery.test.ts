import { expect, test } from "vitest";
import { makeCreateQuery } from "../src/CreateQuery.js";
import { Db } from "./utils.js";

test("CreateQuery", () => {
  const createQuery = makeCreateQuery<Db>();
  const users1 = createQuery((db) =>
    db.selectFrom("users").select(["id", "name"]),
  );
  const users2 = createQuery((db) =>
    db.selectFrom("users").select(["id", "name"]),
  );

  expect(users1).toMatchInlineSnapshot(
    '"{\\"sql\\":\\"select \\\\\\"id\\\\\\", \\\\\\"name\\\\\\" from \\\\\\"users\\\\\\"\\",\\"parameters\\":[]}"',
  );
  expect(users1).toBe(users2);
});
