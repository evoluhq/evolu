// import { Context, Effect, Function, Layer, Number } from "effect";
// import { Query } from "./Query.js";
// import { QueryResult } from "./QueryResult.js";
// import { Row, SerializedSqliteQuery } from "./Sqlite.js";
// import { Store, Unsubscribe } from "./Store.js";
// import { RowsStore } from "./RowsStore.js";

// export interface SubscribedQueries {
//   readonly subscribeQuery: (query: Query) => Store<Row>["subscribe"];
//   readonly getQuery: <R extends Row>(query: Query<R>) => QueryResult<R>;
//   readonly getSubscribedQueries: () => ReadonlyArray<SerializedSqliteQuery>;
// }

// export const SubscribedQueries = Context.Tag<SubscribedQueries>(
//   "evolu/SubscribedQueries",
// );

// export const SubscribedQueriesLive = Layer.effect(
//   SubscribedQueries,
//   Effect.gen(function* (_) {
//     const rowsStore = yield* _(RowsStore);
//     const subscribedQueries = new Map<SerializedSqliteQuery, number>();

//     return SubscribedQueries.of({
//       subscribeQuery:
//         (query) =>
//         (listener): Unsubscribe => {
//           subscribedQueries.set(
//             query.query,
//             Number.increment(subscribedQueries.get(query.query) ?? 0),
//           );
//           const unsubscribe = rowsStore.subscribe(listener);

//           return () => {
//             const count = subscribedQueries.get(query.query);
//             if (count == null) return;
//             if (count > 1)
//               subscribedQueries.set(query.query, Number.decrement(count));
//             else subscribedQueries.delete(query.query);
//             unsubscribe();
//           };
//         },

//       getQuery() {
//         throw "";
//       },

//       getSubscribedQueries() {
//         throw "";
//       },
//     });
//   }),
// );

// // const subscribe: QueryStore["subscribe"] = (query) => (listen) => {
// //   if (query == null) return Function.constVoid;
// //   subscribedQueries.set(
// //     query,
// //     Number.increment(subscribedQueries.get(query) ?? 0),
// //   );
// //   const unsubscribe = rowsCacheStore.subscribe(listen);
// //   return () => {
// //     // `as number`, because React mount/unmount are symmetric.
// //     const count = subscribedQueries.get(query) as number;
// //     if (count > 1) subscribedQueries.set(query, Number.decrement(count));
// //     else subscribedQueries.delete(query);
// //     unsubscribe();
// //   };
// // };

// // const getState: QueryStore["getState"] = (query) =>
// //   (query && rowsCacheStore.getState().get(query)) || null;
