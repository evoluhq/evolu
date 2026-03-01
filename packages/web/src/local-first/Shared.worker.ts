/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();

import { createWebSocket } from "@evolu/common";
import { initSharedWorker } from "@evolu/common/local-first";
import { createRun } from "../Task.js";
import { createSharedWorkerSelf, createWorkerDeps } from "../Worker.js";

// No disposal (`await using`) is needed — a SharedWorker lives forever.
const run = createRun({
  ...createWorkerDeps(),
  createWebSocket,
});

run(initSharedWorker(createSharedWorkerSelf(self)));
