/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import { initDbWorker } from "@evolu/common/local-first";
import { leaderLock } from "../Platform.js";
import { createRun } from "../Task.js";
import { createWorkerDeps, createWorkerSelf } from "../Worker.js";

// TODO: Disposal.
const run = createRun({
  ...createWorkerDeps(),
  leaderLock,
});

run(initDbWorker(createWorkerSelf(self)));
