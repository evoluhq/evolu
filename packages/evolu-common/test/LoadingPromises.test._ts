import { Effect } from "effect";
import { expect, test } from "vitest";
import { makeCreateQuery } from "../src/CreateQuery.js";
import {
  LoadingPromises,
  LoadingPromisesLive,
} from "../src/LoadingPromises.js";
import { Db } from "./utils.js";

test("LoadingPromises", () => {
  Effect.gen(function* (_) {
    const createQuery = makeCreateQuery<Db>();
    const loadingPromises = yield* _(LoadingPromises);

    const query1 = createQuery((db) => db.selectFrom("users").selectAll());
    const query1WithDifferentFilterMap = createQuery(
      (db) => db.selectFrom("users").selectAll(),
      ({ name, ...rest }) => name != null && { name, ...rest },
    );

    const p1 = loadingPromises.get(query1);
    const p2 = loadingPromises.get(query1);
    const p3 = loadingPromises.get(query1WithDifferentFilterMap);

    expect(p1.isNew).toBe(true);
    expect(p2.isNew).toBe(false);
    // The same query but different filterMap must return new promise.
    expect(p3.isNew).toBe(true);
    expect(p1.promise).toBe(p2.promise);
    expect(p2.promise).not.toBe(p3.promise);

    // Release nothing because all are pending.
    loadingPromises.release();
    expect(loadingPromises.get(query1).isNew).toBe(false);
    expect(loadingPromises.get(query1WithDifferentFilterMap).isNew).toBe(false);

    // Release on resolve.
    loadingPromises.resolve(query1.query, []);
    expect(loadingPromises.get(query1).isNew).toBe(true);
    expect(loadingPromises.get(query1WithDifferentFilterMap).isNew).toBe(true);

    // Release resolved.
    loadingPromises.resolve(query1.query, []);
    loadingPromises.release();
    expect(loadingPromises.get(query1).isNew).toBe(true);
    expect(loadingPromises.get(query1WithDifferentFilterMap).isNew).toBe(true);
  }).pipe(Effect.provide(LoadingPromisesLive), Effect.runSync);
});
