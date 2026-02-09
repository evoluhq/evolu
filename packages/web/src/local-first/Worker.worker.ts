/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { initEvoluWorker } from "@evolu/common/local-first";
import { createSharedWorkerSelf, createWorkerRun } from "../Worker.js";

await using run = createWorkerRun();

await run(initEvoluWorker(createSharedWorkerSelf(self)));
