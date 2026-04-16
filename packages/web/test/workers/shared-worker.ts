import { installPolyfills } from "@evolu/common/polyfills";
import { createSharedWorkerSelf } from "../../src/Worker.js";

installPolyfills();

interface WorkerInput {
  readonly type: "echo";
  readonly value: string;
}

interface WorkerOutput {
  readonly type: "echo";
  readonly value: string;
}

const workerSelf = createSharedWorkerSelf<WorkerInput, WorkerOutput>(
  self as unknown as globalThis.SharedWorkerGlobalScope,
);

workerSelf.onConnect = (port) => {
  port.onMessage = (message) => {
    port.postMessage({ type: "echo", value: message.value });
  };
};
