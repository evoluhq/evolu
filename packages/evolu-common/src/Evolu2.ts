import { Schema, Tables } from "./Db.js";
import { EvoluError } from "./Errors.js";
import { Mutations } from "./Mutations.js";
import { OwnerStore } from "./OwnerStore.js";
import { QueryStore } from "./QueryStore.js";
import { Listener, Unsubscribe } from "./Store.js";
import { SyncState } from "./SyncWorker.js";

export interface Evolu2<S extends Schema>
  extends QueryStore<S>,
    Mutations<S>,
    OwnerStore,
    ErrorStore,
    SyncStateStore {
  /** Ensure schema ad-hoc for hot reloading. */
  readonly ensureSchema: (tables: Tables) => void;
}

interface ErrorStore {
  readonly subscribeError: (listener: Listener) => Unsubscribe;
  readonly getError: () => EvoluError | null;
}

interface SyncStateStore {
  readonly subscribeSyncState: (listener: Listener) => Unsubscribe;
  readonly getSyncState: () => SyncState;
}
