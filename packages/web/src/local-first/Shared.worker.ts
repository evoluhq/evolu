/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { initSharedWorker } from "@evolu/common/local-first";
import { createRun } from "../Task.js";
import { createSharedWorkerSelf, createWorkerDeps } from "../Worker.js";

// No disposal (`await using`) is needed — a SharedWorker lives forever.
const run = createRun(createWorkerDeps());

run(initSharedWorker(createSharedWorkerSelf(self)));
