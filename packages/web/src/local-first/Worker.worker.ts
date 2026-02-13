/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { initEvoluWorker } from "@evolu/common/local-first";
import { createSharedWorkerSelf, createWorkerRun } from "../Worker.js";

// No disposal (`await using`) is needed — a SharedWorker lives forever.
const run = createWorkerRun();

run(initEvoluWorker(createSharedWorkerSelf(self)));
