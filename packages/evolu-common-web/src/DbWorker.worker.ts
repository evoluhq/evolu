import { createDbWorker } from "@evolu/common";
import * as Effect from "effect/Effect";
import { expose } from "./ProxyWorker.js";

const worker = createDbWorker().pipe(Effect.runSync);

expose(worker);
