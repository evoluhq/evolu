import type { BroadcastChannel, CreateBroadcastChannel } from "@evolu/common";
import { assertNotDisposed } from "@evolu/common";

/** Creates a {@link BroadcastChannel} from a Node.js BroadcastChannel. */
export const createBroadcastChannel: CreateBroadcastChannel = <
  Input,
  Output = Input,
>(
  name: string,
): BroadcastChannel<Input, Output> => {
  const nativeBroadcastChannel = new globalThis.BroadcastChannel(name);
  using disposer = new DisposableStack();

  disposer.defer(() => {
    nativeBroadcastChannel.onmessage = null;
    nativeBroadcastChannel.close();
  });

  const disposables = disposer.move();
  let onMessageHandler: ((message: Output) => void) | null = null;

  return {
    postMessage: (message) => {
      assertNotDisposed(disposables);
      nativeBroadcastChannel.postMessage(message);
    },
    get onMessage() {
      return disposables.disposed ? null : onMessageHandler;
    },
    set onMessage(fn) {
      if (disposables.disposed) return;
      onMessageHandler = fn;
      nativeBroadcastChannel.onmessage = fn
        ? (event: MessageEvent<Output>) => {
            fn(event.data);
          }
        : null;
    },
    [Symbol.dispose]: () => disposables.dispose(),
  };
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
