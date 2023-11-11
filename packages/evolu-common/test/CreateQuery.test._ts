import { assertType, expect, test } from "vitest";
import { makeCreateQuery } from "../src/CreateQuery.js";
import { Id } from "../src/Model.js";
import { Db } from "./utils.js";

test("CreateQuery", () => {
  const createQuery = makeCreateQuery<Db>();
  const usersAll = createQuery(
    (db) => db.selectFrom("users").select(["id", "name"]),
    ({ name, ...rest }) => name != null && { name, ...rest },
  );

  expect(usersAll.query).toMatchInlineSnapshot(
    '"{\\"sql\\":\\"select \\\\\\"id\\\\\\", \\\\\\"name\\\\\\" from \\\\\\"users\\\\\\"\\",\\"parameters\\":[]}"',
  );

  expect(
    usersAll.filterMap({ id: "a" as Id, name: null }),
  ).toMatchInlineSnapshot("false");

  const identity = { id: "a" as Id, name: "b" };
  const mapped = usersAll.filterMap(identity);
  if (mapped) assertType<string>(mapped.name);

  // Must preserve identity.
  expect(usersAll.filterMap(identity)).toBe(mapped);
});
