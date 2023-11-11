// import { Context, Effect, Layer, ReadonlyArray, pipe } from "effect";
// import { DbWorkerOutputOnQuery } from "./DbWorker.js";
// import { applyPatches } from "./Diff.js";
// import { OnCompletes } from "./OnCompletes.js";
// import { FlushSync } from "./Platform.js";
// import { LoadingPromises } from "./LoadingPromises.js";
// import { RowsStore } from "./RowsStore.js";

// export type OnQuery = (
//   output: DbWorkerOutputOnQuery,
// ) => Effect.Effect<never, never, void>;

// export const OnQuery = Context.Tag<OnQuery>("evolu/OnQuery");

// export const OnQueryLive = Layer.effect(
//   OnQuery,
//   Effect.gen(function* (_) {
//     const rowsStore = yield* _(RowsStore);
//     const loadingPromises = yield* _(LoadingPromises);
//     const flushSync = yield* _(FlushSync);
//     const onCompletes = yield* _(OnCompletes);

//     return OnQuery.of(({ queriesPatches, onCompleteIds }) =>
//       Effect.gen(function* (_) {
//         const currentState = rowsStore.getState();

//         // dostanu queries a jejich patches
//         // mam ReadonlyMap<SerializedSqliteQuery, ReadonlyArray<Row>>;
//         // muze a nemusi bejt rows ve value
//         // getQuery imho ma vracet nic, kdyz je nic?
//         // uz ted vidim chybu, ze do promisi davam empty
//         // get query vracet taky empty?
//         // jo
//         //

//         const nextState = pipe(
//           queriesPatches,
//           ReadonlyArray.map(
//             ({ query, patches }) =>
//               [
//                 query,
//                 // nechapu
//                 // pro kazde query zalozi vysledek?
//                 // ono to presmahne skrze tu mapu
//                 // jako, query vrati co? klidne empty pole, nebo pole necejo
//                 // tohle by melo bejt jinak, pokud neni co patchovat,
//                 // co to je?
//                 // dostanu query, a patches muze bejt empty, ale to je fuk
//                 // jak to je?
//                 //
//                 applyPatches(patches)(currentState.get(query) || []),
//               ] as const,
//           ),
//           (a) => new Map([...currentState, ...a]),
//         );

//         queriesPatches.forEach(({ query }) => {
//           // furt nove, imho spatne
//           loadingPromises.resolve(query, nextState.get(query) || []);
//         });

//         // No mutation is using onComplete, so we don't need flushSync.
//         if (onCompleteIds.length === 0) {
//           rowsStore.setState(nextState);
//           return;
//         }

//         flushSync(() => rowsStore.setState(nextState));

//         yield* _(onCompletes.flush(onCompleteIds));
//       }),
//     );
//   }),
// );
