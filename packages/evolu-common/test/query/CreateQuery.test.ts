import { Effect } from "effect";
import { assertType, expect, test } from "vitest";
import { Id } from "../../src/Model.js";
import { CreateQuery, CreateQueryLive } from "../../src/query/CreateQuery.js";

type Db = { users: { id: Id; name: string } };

test("CreateQuery", () => {
  Effect.gen(function* (_) {
    const createQuery = yield* _(CreateQuery<Db>());
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
    expect(usersAll.filterMap(identity) === mapped).toBe(true);
  }).pipe(Effect.provide(CreateQueryLive<Db>()), Effect.runSync);
});
