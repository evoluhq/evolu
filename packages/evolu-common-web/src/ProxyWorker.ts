import * as S from "@effect/schema/Schema";
import { Config, createEvoluRuntime } from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import { ManagedRuntime } from "effect/ManagedRuntime";
import { nanoid } from "nanoid";

/**
 * Something like Comlink but simplified and with Effect API.
 *
 * We can't use Comlink, because:
 * https://twitter.com/_baxuz/status/1760627954928009604
 *
 * We can't use Effect Worker because we need max performance and it's nice to
 * have Proxy.
 */

interface PostMessage {
  readonly id: string;
  readonly name: string;
  readonly args: unknown[];
  readonly config: Config;
}

interface OnMessage {
  readonly id: string;
  readonly response: Success | Error;
}

interface Success {
  _tag: "success";
  value: unknown;
}

interface Error {
  _tag: "error";
  error: unknown;
}

const UnknownEither = S.either({ left: S.unknown, right: S.unknown });
type UnknownEither = S.Schema.Type<typeof UnknownEither>;

export const wrap = <T>(worker: Worker): T => {
  const promises = new Map<
    string,
    {
      readonly resolve: (value: unknown) => void;
      readonly reject: (value: unknown) => void;
    }
  >();

  worker.onmessage = ({
    data: { id, response },
  }: MessageEvent<OnMessage>): void => {
    if (response._tag === "success") promises.get(id)?.resolve(response.value);
    else promises.get(id)?.reject(response.error);
    promises.delete(id);
  };

  const proxy = new Proxy(worker, {
    get(target: Worker, name: string) {
      return (...args: unknown[]) =>
        Config.pipe(
          Effect.flatMap((config) =>
            Effect.promise(
              () =>
                new Promise((resolve, reject) => {
                  const id = nanoid();
                  promises.set(id, { resolve, reject });
                  const message: PostMessage = { id, name, args, config };
                  target.postMessage(message);
                }),
            ),
          ),
          Effect.map((a) => S.decodeSync(UnknownEither)(a as UnknownEither)),
          Effect.flatMap(
            Either.match({ onLeft: Effect.fail, onRight: Effect.succeed }),
          ),
        );
    },
  });

  return proxy as T;
};

/** An object with functions returning Effect. */
type ExposableObject = Record<
  any,
  (...args: unknown[]) => Effect.Effect<any, any>
>;

// ExposableObject doesn't match class instance 🤔
export const expose = (object: object): void => {
  let runtime: ManagedRuntime<Config, never> | null = null;

  onmessage = ({
    data: { id, name, args, config },
  }: MessageEvent<PostMessage>): void => {
    if (runtime == null) runtime = createEvoluRuntime(config);

    (object as ExposableObject)
      [name](...args)
      .pipe(
        Effect.either,
        Effect.map(S.encodeSync(UnknownEither)),
        runtime.runPromise,
      )
      .then(
        (value) => {
          postMessage({
            id,
            response: { _tag: "success", value },
          } satisfies OnMessage);
        },
        (error) => {
          // Error can't be transferred.
          if (error instanceof Error) {
            error = {
              message: error.message,
              name: error.name,
              stack: error.stack,
            };
          }
          postMessage({
            id,
            response: { _tag: "error", error: error },
          } satisfies OnMessage);
        },
      );
  };
};
