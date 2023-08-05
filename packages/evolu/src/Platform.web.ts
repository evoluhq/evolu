import { Layer } from "effect";
import { flushSync } from "react-dom";
import { FlushSync } from "./Platform.js";

export const FlushSyncLive = Layer.succeed(FlushSync, FlushSync.of(flushSync));
