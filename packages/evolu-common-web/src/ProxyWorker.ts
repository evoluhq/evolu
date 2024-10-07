/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Config, createRuntime, ensureTransferableError } from "@evolu/common";
import * as Effect from "effect/Effect";
import { ManagedRuntime } from "effect/ManagedRuntime";
import { nanoid } from "nanoid";

/**
 * Something like Comlink but simplified and with Effect API.
 *
 * We can't use Comlink, because:
 * https://x.com/_baxuz/status/1760627954928009604
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
  readonly args: PostMessageData[];
  readonly config: Config;
}

export type PostMessageData =
  | string
  | number
  | boolean
  | null
  | undefined
  | PostMessageObject
  | PostMessageArray
  | ArrayBuffer
  | Blob
  | File
  | MessagePort
  | ImageBitmap
  | ((...args: PostMessageData[]) => void);

interface PostMessageObject {
  [key: string]: PostMessageData;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface PostMessageArray extends Array<PostMessageData> {}

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

  worker.onmessage = ({ data: message }: MessageEvent<OnMessage>) => {
    const callback = callbacks.get(message.id);
    if (callback) {
      callback(message.response);
      callbacks.delete(message.id);
    }
  };

  const proxy = new Proxy(worker, {
    get(target: Worker, name: string) {
      return (...argsMaybeWithCallback: PostMessageData[]) =>
        Effect.flatMap(Config, (config) =>
          Effect.async<unknown, unknown>((resume) => {
            const ports: MessagePort[] = [];
            const args = argsMaybeWithCallback.map((arg) => {
              if (typeof arg !== "function") return arg;
              const channel = new MessageChannel();
              channel.port1.onmessage = ({ data }) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                arg(...data);
              };
              ports.push(channel.port2);
              return channel.port2;
            });
            // Nanoid is pretty fast. No reason to use incremented counter.
            const id = nanoid();
            callbacks.set(id, (response) => {
              resume(Effect[response._tag](response.value));
            });
            const message: PostMessage = { id, name, args, config };
            target.postMessage(message, ports);
          }),
        );
    },
  });

  return proxy as T;
};

/** Expose an object with functions returning Effect. */
export const expose = <FnName extends string>(
  object: Record<FnName, (...args: any[]) => Effect.Effect<any, any, any>>,
): void => {
  let runtime: ManagedRuntime<Config, never> | null = null;

  onmessage = ({
    data: { id, name, args, config },
  }: MessageEvent<PostMessage>) => {
    if (runtime == null) runtime = createRuntime(config);

    const argsMaybeWithCallback = args.map((arg) => {
      if (!(arg instanceof MessagePort)) return arg;
      return (...args: unknown[]) => {
        arg.postMessage(args);
      };
    });

    runtime.runFork(
      object[name as FnName](...argsMaybeWithCallback).pipe(
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
