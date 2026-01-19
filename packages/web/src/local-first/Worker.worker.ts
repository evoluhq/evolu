/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { runEvoluWorkerScope } from "@evolu/common/local-first";
import { createMessagePort, createSharedWorkerScope } from "../Worker.js";

runEvoluWorkerScope({ createMessagePort })(createSharedWorkerScope(self));
