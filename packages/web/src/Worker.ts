import { assert, Lazy, SharedWorker } from "@evolu/common";

/**
 * Error that occurs when a SharedWorker fails to initialize (loading, uncaught
 * exceptions in worker).
 */
export interface SharedWorkerInitError {
  readonly type: "SharedWorkerInitError";
  readonly event: ErrorEvent;
}

/** Error that occurs when a message cannot be deserialized or transferred. */
export interface SharedWorkerMessageError {
  readonly type: "SharedWorkerMessageError";
  readonly event: MessageEvent;
}

export type SharedWorkerError =
  | SharedWorkerInitError
  | SharedWorkerMessageError;

/**
 * Creates a platform-agnostic SharedWorker from a native SharedWorker.
 *
 * The return type annotation allows TypeScript to infer the Input and Output
 * types from the SharedWorker type alias, eliminating the need for explicit
 * generic arguments.
 *
 * ### Example
 *
 * ```ts
 * // Define your message types
 * type MyInput = { type: "ping" } | { type: "sync" };
 * type MyOutput = { type: "pong" } | { type: "error"; message: string };
 *
 * // Create type alias
 * type MySharedWorker = SharedWorker<MyInput, MyOutput>;
 *
 * const sharedWorker: MySharedWorker = createSharedWorker(
 *   () =>
 *     new globalThis.SharedWorker(
 *       new URL("SharedWorker.worker.js", import.meta.url),
 *       { type: "module" },
 *     ),
 *   // Handle worker errors (initialization or message deserialization)
 *   (error) => {
 *     switch (error.type) {
 *       case "SharedWorkerInitError":
 *         console.error("Worker failed to load:", error.event);
 *         break;
 *       case "SharedWorkerMessageError":
 *         console.error("Message corruption:", error.event);
 *         break;
 *     }
 *   },
 * );
 *
 * // Now fully typed
 * sharedWorker.port.postMessage({ type: "ping" }); // Input
 * sharedWorker.port.onMessage = (msg) => {
 *   // msg is MyOutput
 *   if (msg.type === "pong") console.log("Received pong");
 * };
 * ```
 */
export const createSharedWorker = <Input, Output>(
  createNativeSharedWorker: Lazy<globalThis.SharedWorker>,
  onError: (error: SharedWorkerError) => void,
): SharedWorker<Input, Output> => {
  const nativeSharedWorker = createNativeSharedWorker();

  nativeSharedWorker.onerror = (event) => {
    onError({ type: "SharedWorkerInitError", event });
  };

  const sharedWorker: SharedWorker<Input, Output> = {
    port: {
      postMessage: (message: Input) => {
        nativeSharedWorker.port.postMessage(message);
      },
      onMessage: null,
      [Symbol.dispose]: () => {
        nativeSharedWorker.onerror = null;
        nativeSharedWorker.port.onmessage = null;
        nativeSharedWorker.port.onmessageerror = null;
        nativeSharedWorker.port.close();
      },
    },
  };

  nativeSharedWorker.port.onmessage = (ev) => {
    assert(
      sharedWorker.port.onMessage != null,
      "onMessage must be set before receiving messages",
    );
    sharedWorker.port.onMessage(ev.data as Output);
  };

  nativeSharedWorker.port.onmessageerror = (event) => {
    onError({ type: "SharedWorkerMessageError", event });
  };

  return sharedWorker;
};
