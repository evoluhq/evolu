import { Either } from "effect";
import { Owner } from "./Db.js";
import { Listener, Unsubscribe } from "./Store.js";

export interface OwnerStore {
  readonly subscribeOwner: (listener: Listener) => Unsubscribe;
  readonly getOwner: () => Owner | null;

  /**
   * Delete all local data from the current device.
   * After the deletion, Evolu reloads all browser tabs that use Evolu.
   */
  readonly resetOwner: () => void;

  /**
   * Restore `Owner` with synced data from different devices.
   */
  readonly restoreOwner: (
    mnemonic: string,
  ) => Promise<Either.Either<RestoreOwnerError, void>>;
}

interface RestoreOwnerError {
  readonly _tag: "RestoreOwnerError";
}
