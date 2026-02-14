/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { initSharedWorker } from "@evolu/common/local-first";
import { createSharedWorkerSelf, createWorkerRun } from "../Worker.js";

// No disposal (`await using`) is needed — a SharedWorker lives forever.
const run = createWorkerRun();

run(initSharedWorker(createSharedWorkerSelf(self)));
