// TODO: Port those tests.

// import { Effect } from "effect";
// import { expect, test } from "vitest";
// import {
//   LoadingPromiseLive,
//   LoadingPromises,
//   SubscribedQueriesLive,
//   makeCreateQuery,
// } from "../src/Evolu.js";
// import { Db } from "./utils.js";
// import { RowsStoreLive } from "../src/Db.js";

// test("createQuery", () => {
//   const createQuery = makeCreateQuery<Db>();
//   const users1 = createQuery((db) =>
//     db.selectFrom("users").select(["id", "name"]),
//   );
//   const users2 = createQuery((db) =>
//     db.selectFrom("users").select(["id", "name"]),
//   );

//   expect(users1).toMatchInlineSnapshot(
//     `"{"sql":"select \\"id\\", \\"name\\" from \\"users\\"","parameters":[]}"`,
//   );
//   expect(users1).toBe(users2);
// });

// test("LoadingPromises", () => {
//   Effect.gen(function* (_) {
//     const createQuery = makeCreateQuery<Db>();
//     const loadingPromises = yield* _(LoadingPromises);

//     const query1 = createQuery((db) => db.selectFrom("users").selectAll());
//     const query2 = createQuery((db) => db.selectFrom("users").select(["id"]));

//     const p1 = loadingPromises.get(query1);
//     const p2 = loadingPromises.get(query1);
//     const p3 = loadingPromises.get(query2);

//     // Reuse promise.
//     expect(p1.isNew).toBe(true);
//     expect(p2.isNew).toBe(false);
//     expect(p1.promise).toBe(p2.promise);
//     expect(p1.promise).not.toBe(p3.promise);

//     // Release nothing because all are pending.
//     loadingPromises.release();
//     expect(loadingPromises.get(query1).isNew).toBe(false);
//     expect(loadingPromises.get(query2).isNew).toBe(false);

//     // Release on resolve.
//     loadingPromises.resolve(query1, []);
//     expect(loadingPromises.get(query1).isNew).toBe(true);
//     expect(loadingPromises.get(query2).isNew).toBe(false);

//     // Release resolved.
//     loadingPromises.resolve(query1, []);
//     loadingPromises.release();
//     expect(loadingPromises.get(query1).isNew).toBe(true);
//   }).pipe(
//     Effect.provide(LoadingPromiseLive),
//     Effect.provide(SubscribedQueriesLive),
//     Effect.provide(RowsStoreLive),
//     Effect.runSync,
//   );
// });
