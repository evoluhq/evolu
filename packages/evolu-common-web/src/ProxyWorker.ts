import { Config, createEvoluRuntime } from "@evolu/common";
import * as Effect from "effect/Effect";
import { ManagedRuntime } from "effect/ManagedRuntime";
import { nanoid } from "nanoid";
import { ensureTransferableError } from "./ensureTransferableError.js";

/**
 * Something like Comlink but simplified and with Effect API.
 *
 * We can't use Comlink, because:
 * https://twitter.com/_baxuz/status/1760627954928009604
 *
 * We can't use Effect Worker because we need max performance and it's nice to
 * have Proxy.
 *
 * - https://github.com/GoogleChromeLabs/comlink/pull/469
 * - https://github.com/GoogleChromeLabs/comlink/pull/654#issuecomment-1900762145
 */

interface PostMessage {
  readonly id: string;
  readonly name: string;
  readonly args: unknown[];
  readonly config: Config;
}

interface OnMessage {
  readonly id: string;
  readonly response: OnMessageResponse;
}

type OnMessageResponse = Succeed | Fail | Die;

interface Succeed {
  _tag: "succeed";
  value: unknown;
}

interface Fail {
  _tag: "fail";
  value: unknown;
}

interface Die {
  _tag: "die";
  value: unknown;
}

export const wrap = <T>(worker: Worker): T => {
  const callbacks = new Map<string, (response: OnMessageResponse) => void>();

  worker.onmessage = ({ data: message }: MessageEvent<OnMessage>): void => {
    const callback = callbacks.get(message.id);
    if (callback) {
      callback(message.response);
      callbacks.delete(message.id);
    }
  };

  const proxy = new Proxy(worker, {
    get(target: Worker, name: string) {
      return (...args: unknown[]) =>
        Effect.flatMap(Config, (config) =>
          Effect.async<unknown, unknown>((resume) => {
            // Nanoid is pretty fast. No reason to use incremented counter.
            const id = nanoid();
            callbacks.set(id, (response) => {
              resume(Effect[response._tag](response.value));
            });
            const message: PostMessage = { id, name, args, config };
            target.postMessage(message);
          }),
        );
    },
  });

  return proxy as T;
};

/** An object with functions returning Effect. */
type ExposableObject = Record<
  any,
  (...args: unknown[]) => Effect.Effect<unknown, unknown>
>;

// ExposableObject doesn't match class instance 🤔
export const expose = (object: object): void => {
  let runtime: ManagedRuntime<Config, never> | null = null;

  onmessage = ({
    data: { id, name, args, config },
  }: MessageEvent<PostMessage>): void => {
    if (runtime == null) runtime = createEvoluRuntime(config);

    runtime.runFork(
      (object as ExposableObject)[name](...args).pipe(
        Effect.map(
          (value): OnMessage => ({ id, response: { _tag: "succeed", value } }),
        ),
        Effect.catchAll((value) =>
          Effect.succeed<OnMessage>({ id, response: { _tag: "fail", value } }),
        ),
        Effect.catchAllDefect((error) =>
          Effect.succeed<OnMessage>({
            id,
            response: { _tag: "die", value: ensureTransferableError(error) },
          }),
        ),
        Effect.tap((message) => postMessage(message)),
      ),
    );
  };
};
