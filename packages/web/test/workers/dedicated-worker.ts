import { installPolyfills } from "@evolu/common/polyfills";
import { createWorkerSelf } from "../../src/Worker.js";

installPolyfills();

interface WorkerInput {
  readonly type: "echo";
  readonly value: string;
}

type WorkerOutput =
  | { readonly type: "ready" }
  | { readonly type: "echo"; readonly value: string };

const workerSelf = createWorkerSelf<WorkerInput, WorkerOutput>(
  self as unknown as globalThis.DedicatedWorkerGlobalScope,
);

workerSelf.onMessage = (message) => {
  workerSelf.postMessage({ type: "echo", value: message.value });
};

workerSelf.postMessage({ type: "ready" });
