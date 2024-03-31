import * as S from "@effect/schema/Schema";
import * as Comlink from "comlink";
import * as Either from "effect/Either";

/**
 * Wrapped API must use Promise<Either<..>> instead of Effect because Comlink
 * can't transport nor "transferHandlers" Effect.
 */

const unknownEither = S.either({ left: S.unknown, right: S.unknown });

export const initComlink = (): void => {
  // Wrap callbacks automatically.
  // https://github.com/GoogleChromeLabs/comlink/issues/556
  Comlink.transferHandlers.set("FUNC", {
    canHandle: (obj): obj is () => void => typeof obj === "function",
    serialize: (obj) => {
      const { port1, port2 } = new MessageChannel();
      Comlink.expose(obj, port1);
      return [port2, [port2]];
    },
    deserialize: (port) => {
      return Comlink.wrap(port as MessagePort);
    },
  });

  Comlink.transferHandlers.set("Either", {
    canHandle: Either.isEither,
    serialize: (either: Either.Either<unknown, unknown>) => [
      S.encodeSync(unknownEither)(either),
      [],
    ],
    deserialize: S.decodeSync(unknownEither),
  });
};
