import { createSync } from "@evolu/common";
import * as Effect from "effect/Effect";
import { expose } from "./ProxyWorker.js";

createSync.pipe(
  // Effect.provide(layer),
  Effect.runSync,
  expose,
);

// export const SyncLockLive = Layer.effect(
//   SyncLock,
//   Effect.sync(() => {
//     // No multitenantLockName because this will be redesigned.
//     const lockName = "evolu:sync";
//     let release: null | (() => void) = null;

//     return SyncLock.of({
//       acquire: Effect.gen(function* (_) {
//         if (release) return false;
//         release = Function.constVoid;
//         return yield* _(
//           Effect.async<boolean>((resume) => {
//             navigator.locks.request(lockName, { ifAvailable: true }, (lock) => {
//               if (lock == null) {
//                 release = null;
//                 resume(Effect.succeed(false));
//                 return;
//               }
//               resume(Effect.succeed(true));
//               return new Promise<void>((resolve) => {
//                 release = resolve;
//               });
//             });
//           }),
//         );
//       }),

//       release: Effect.sync(() => {
//         if (release) release();
//         release = null;
//       }),
//     });
//   }),
// );
