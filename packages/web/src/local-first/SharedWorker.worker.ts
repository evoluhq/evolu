/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { runSharedWorkerScope } from "@evolu/common/local-first";
import { createMessagePort, createSharedWorkerScope } from "../Worker.js";

runSharedWorkerScope({ createMessagePort })(createSharedWorkerScope(self));
