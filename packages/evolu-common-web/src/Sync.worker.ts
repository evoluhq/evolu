import { SecretBox, createSync } from "@evolu/common";
import * as Effect from "effect/Effect";
import { expose } from "./ProxyWorker.js";

createSync.pipe(Effect.provide(SecretBox.Live), Effect.runSync, expose);
