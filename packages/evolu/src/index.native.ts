import { Function, Layer } from "effect";
import { Bip39Live, NanoIdLive } from "./CryptoLive.native.js";
import { DbWorker } from "./DbWorker.js";
import {
  AppStateLive,
  FlushSyncLive,
  PlatformLive,
} from "./Platform.native.js";
import { makeReactHooksForPlatform } from "./React.js";
export * from "./exports.js";

// A TypeScript bug, recheck after TS 5.2
import "@effect/schema/Schema";

const DbWorkerLive = Layer.succeed(
  DbWorker,
  DbWorker.of({
    postMessage: (a) => {
      console.log(JSON.stringify(a));
    },
    onMessage: Function.constVoid,
  }),
);

export const create = makeReactHooksForPlatform(
  Layer.use(DbWorkerLive, PlatformLive),
  Layer.use(AppStateLive, PlatformLive),
  PlatformLive,
  Bip39Live,
  NanoIdLive,
  FlushSyncLive,
);
