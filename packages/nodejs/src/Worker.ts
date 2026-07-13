import type { BroadcastChannel, CreateBroadcastChannel } from "@evolu/common";
import { disposable } from "@evolu/common";

/** Creates a {@link BroadcastChannel} from a Node.js BroadcastChannel. */
export const createBroadcastChannel: CreateBroadcastChannel = <
  Input,
  Output = Input,
>(
  name: string,
): BroadcastChannel<Input, Output> => {
  const nativeBroadcastChannel = new globalThis.BroadcastChannel(name);
  using disposer = new DisposableStack();
  let disposed = false;

  disposer.defer(() => {
    disposed = true;
    nativeBroadcastChannel.onmessage = null;
    nativeBroadcastChannel.close();
  });

  let onMessageHandler: ((message: Output) => void) | null = null;

  return disposable<BroadcastChannel<Input, Output>>(
    {
      postMessage: (message) => {
        nativeBroadcastChannel.postMessage(message);
      },
      get onMessage() {
        return disposed ? null : onMessageHandler;
      },
      set onMessage(fn) {
        if (disposed) return;
        onMessageHandler = fn;
        nativeBroadcastChannel.onmessage = fn
          ? (event: MessageEvent<Output>) => {
              fn(event.data);
            }
          : null;
      },
    },
    disposer,
  );
};

// TODO: Implement Node.js Worker API
//
// This module should provide Node.js implementations of the common Worker API:
// - createWorker
// - createWorkerSelf (with onError hooking process.on('uncaughtException') and
//   process.on('unhandledRejection'))
// - createMessageChannel
// - createMessagePort
//
// Node.js uses worker_threads module for Worker/MessageChannel/MessagePort.
// Error handling uses process events instead of globalThis.onerror.
