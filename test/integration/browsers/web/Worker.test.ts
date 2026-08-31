import { assertEqual } from "@evolu/common";
import { test } from "vitest";
import {
  createSharedWorker,
  createWorker,
} from "../../../../packages/web/src/Worker.ts";

interface WorkerInput {
  readonly type: "echo";
  readonly value: string;
}

type WorkerOutput =
  | { readonly type: "ready" }
  | { readonly type: "echo"; readonly value: string };

test("createWorker communicates with createWorkerSelf through a native worker", async () => {
  const nativeWorker = new Worker(
    new URL("./workers/dedicated-worker.ts", import.meta.url),
    { type: "module" },
  );
  using worker = createWorker<WorkerInput, WorkerOutput>(nativeWorker);

  const ready = new Promise<void>((resolve) => {
    worker.onMessage = (message) => {
      if (message.type === "ready") resolve();
    };
  });

  await ready;

  const received = new Promise<WorkerOutput>((resolve) => {
    worker.onMessage = (message) => {
      if (message.type === "echo") resolve(message);
    };
  });

  worker.postMessage({ type: "echo", value: "hello" });

  assertEqual(await received, {
    type: "echo",
    value: "hello",
  });
});

test("createSharedWorker communicates with createSharedWorkerSelf through a native shared worker", async () => {
  const nativeSharedWorker = new SharedWorker(
    new URL("./workers/shared-worker.ts", import.meta.url),
    {
      name: `worker-${crypto.randomUUID()}`,
      type: "module",
    },
  );
  const worker = createSharedWorker<WorkerInput, WorkerOutput>(
    nativeSharedWorker,
  );
  using _worker = worker;

  const received = new Promise<WorkerOutput>((resolve) => {
    worker.port.onMessage = (message) => {
      if (message.type === "echo") resolve(message);
    };
  });

  worker.port.postMessage({ type: "echo", value: "queued" });

  assertEqual(await received, {
    type: "echo",
    value: "queued",
  });
});
