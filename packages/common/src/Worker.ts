/**
 * Cross-Platform Worker Abstraction
 *
 * @module
 */

import { assert } from "./Assert.js";
import { createTransferableError, TransferableError } from "./Error.js";

/** Cross-platform worker abstraction. */
export interface Worker<Input, Output> {
  /** Sends a message to the worker. */
  readonly postMessage: (message: Input) => void;

  /** Sets a callback for messages from the worker. */
  readonly onMessage: (callback: (message: Output) => void) => void;
}

export interface WorkerPostMessageDep<Output> {
  readonly postMessage: (message: Output) => void;
}

/**
 * Creates a {@link Worker} that supports initialization with dependencies and
 * safe error handling.
 */
export const createInitializedWorker = <
  Input extends { readonly type: string } & HasInit<Input>,
  Output extends { readonly type: string } & HasWorkerErrorOutput<Output>,
  Deps,
>({
  init,
  onMessage,
}: {
  readonly init: (
    initMessage: Extract<Input, { type: "init" }>,
    postMessage: (msg: Output) => void,
    safeHandler: <A extends Array<any>>(
      handler: (...args: A) => void,
    ) => (...args: A) => void,
  ) => Promise<Deps | null>;
  readonly onMessage: (
    deps: Deps,
  ) => (message: Exclude<Input, { type: "init" }>) => void;
}): Worker<Input, Output> => {
  type NonInitMessage = Exclude<Input, { type: "init" }>;

  let onMessageCallback: ((msg: Output) => void) | null = null;
  let deps: Deps | null = null;
  const pendingMessages: Array<Input> = [];
  let initializing = false;

  const postMessage = (msg: Output) => {
    assert(onMessageCallback != null, "The onMessage wasn't set");
    onMessageCallback(msg);
  };

  const postMessageTransferableError = (error: unknown) => {
    postMessage({
      type: "onError",
      error: createTransferableError(error),
    } as unknown as Output);
  };

  const safeHandler =
    <A extends Array<any>>(handler: (...args: A) => void) =>
    (...args: A) => {
      try {
        handler(...args);
      } catch (error) {
        postMessageTransferableError(error);
      }
    };

  const worker: Worker<Input, Output> = {
    postMessage: (message) => {
      if (message.type !== "init") {
        if (!deps) {
          pendingMessages.push(message);
        } else {
          safeHandler(onMessage(deps))(message as NonInitMessage);
        }
        return;
      }

      if (initializing) return;
      initializing = true;

      init(
        message as Extract<Input, { type: "init" }>,
        postMessage,
        safeHandler,
      )
        .then((_deps) => {
          if (_deps == null) return;
          deps = _deps;
          for (const message of pendingMessages) {
            safeHandler(onMessage(deps))(message as NonInitMessage);
          }
          pendingMessages.length = 0;
        })
        .catch(postMessageTransferableError);
    },

    onMessage: (callback) => {
      onMessageCallback = callback;
    },
  };

  return worker;
};

type HasInit<Input> =
  Extract<Input, { type: "init" }> extends never
    ? ["Input must contain a variant with { type: 'init' }"]
    : unknown;

type HasWorkerErrorOutput<T> =
  Extract<T, { type: "onError" }> extends infer E
    ? [E] extends [never]
      ? [
          "Output must contain { type: 'onError'; error: TransferableError | ... }",
        ]
      : E extends { error: infer Err }
        ? TransferableError extends Err
          ? unknown
          : ["Output.onError.error must include TransferableError"]
        : ["Output.onError must have an error property"]
    : never;
