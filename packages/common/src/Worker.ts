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
 * Error reporting wrapper that catches synchronous errors in handlers and
 * converts them to transferable error messages sent to the main thread.
 */
export type WithErrorReporting = <A extends Array<any>>(
  handler: (...args: A) => void,
) => (...args: A) => void;

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
    withErrorReporting: WithErrorReporting,
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

  /**
   * Wraps function to catch errors and send them to the main thread instead of
   * crashing the worker.
   */
  const withErrorReporting =
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
          withErrorReporting(onMessage(deps))(message as NonInitMessage);
        }
        return;
      }

      if (initializing) return;
      initializing = true;

      init(
        message as Extract<Input, { type: "init" }>,
        postMessage,
        withErrorReporting,
      )
        .then((_deps) => {
          if (_deps == null) return;
          deps = _deps;
          for (const message of pendingMessages) {
            withErrorReporting(onMessage(deps))(message as NonInitMessage);
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

/** Type helper to extract message types from a union type */
export type MessageHandlers<Input extends { readonly type: string }, Deps> = {
  readonly [K in Input["type"]]: (
    deps: Deps,
  ) => (message: Extract<Input, { type: K }>) => void;
};

/**
 * Creates a {@link Worker} with type-safe message handlers for each message
 * type. This provides better type safety and organization compared to a single
 * onMessage handler.
 */
export const createInitializedWorkerWithHandlers = <
  Input extends { readonly type: string } & HasInit<Input>,
  Output extends { readonly type: string } & HasWorkerErrorOutput<Output>,
  Deps,
>({
  init,
  handlers,
}: {
  readonly init: (
    initMessage: Extract<Input, { type: "init" }>,
    postMessage: (msg: Output) => void,
    withErrorReporting: WithErrorReporting,
  ) => Promise<Deps | null>;
  readonly handlers: Omit<MessageHandlers<Input, Deps>, "init">;
}): Worker<Input, Output> =>
  createInitializedWorker({
    init,
    onMessage: (deps) => (message) => {
      type NonInitMessageType = Exclude<Input["type"], "init">;
      const messageType = message.type as NonInitMessageType;
      const handler = handlers[messageType];

      // TypeScript knows handler exists because handlers covers all non-init message types
      handler(deps)(message as Extract<Input, { type: typeof messageType }>);
    },
  });
