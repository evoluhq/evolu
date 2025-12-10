/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { initSharedWorker } from "@evolu/common/local-first";
import { createSharedWorkerGlobalScope } from "../Worker.js";

initSharedWorker(createSharedWorkerGlobalScope(self));
