import { Context, Effect, Either, Layer } from "effect";
import { Bip39 } from "./Crypto.js";
import { DbWorker } from "./DbWorker.js";

export interface OwnerActions {
  /**
   * Use `reset` to delete all local data from the current device.
   * After the deletion, Evolu reloads all browser tabs that use Evolu.
   */
  readonly reset: () => void;

  /**
   * Use `restore` to restore `Owner` with synced data on a different device.
   */
  readonly restore: (
    mnemonic: string,
  ) => Promise<Either.Either<RestoreOwnerError, void>>;
}

export interface RestoreOwnerError {
  readonly _tag: "RestoreOwnerError";
}

export const OwnerActions = Context.Tag<OwnerActions>("evolu/OwnerActions");

export const OwnerActionsLive = Layer.effect(
  OwnerActions,
  Effect.gen(function* (_) {
    const dbWorker = yield* _(DbWorker);
    const bip39 = yield* _(Bip39);

    const reset: OwnerActions["reset"] = () => {
      dbWorker.postMessage({ _tag: "reset" });
    };

    const restore: OwnerActions["restore"] = (mnemonic) =>
      bip39.parse(mnemonic).pipe(
        Effect.flatMap((mnemonic) =>
          Effect.sync(() => {
            dbWorker.postMessage({ _tag: "reset", mnemonic });
            return Either.right(undefined);
          }),
        ),
        Effect.catchTag("InvalidMnemonicError", () =>
          Effect.succeed(
            Either.left<RestoreOwnerError>({ _tag: "RestoreOwnerError" }),
          ),
        ),
        Effect.runPromise,
      );

    return { reset, restore };
  }),
);
