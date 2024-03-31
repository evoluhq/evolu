import { createDbWorker } from "@evolu/common";
import * as Comlink from "comlink";
import * as Effect from "effect/Effect";
import { initComlink } from "./Comlink.js";

initComlink();

const worker = createDbWorker().pipe(Effect.runSync);

Comlink.expose(worker);
