// import {
//   DbWorkerLive,
//   FetchLive,
//   NanoIdLive,
//   SecretBoxLive,
//   SyncWorkerLive,
// } from "@evolu/common";
// import { makeReactHooksForPlatform } from "@evolu/common-react";
// import { Layer } from "effect";
// import {
//   AppStateLive,
//   Bip39Live,
//   FlushSyncLive,
//   PlatformLive,
//   SyncLockLive,
// } from "./PlatformLive.js";
// import { SqliteLive } from "./SqliteLive.js";

// export * from "@evolu/common/public";

// export const create = makeReactHooksForPlatform(
//   Layer.use(
//     DbWorkerLive,
//     Layer.mergeAll(
//       SqliteLive,
//       Bip39Live,
//       NanoIdLive,
//       Layer.use(
//         SyncWorkerLive,
//         Layer.mergeAll(SyncLockLive, FetchLive, SecretBoxLive),
//       ),
//     ),
//   ),
//   Layer.use(AppStateLive, PlatformLive),
//   PlatformLive,
//   Bip39Live,
//   NanoIdLive,
//   FlushSyncLive,
// );
