import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import { readClock } from "./Clock.js";
import { query } from "./Query.js";
import {
  Config,
  Db,
  DbWorkerOnMessage,
  DbWorkerRowsCache,
  IsSyncing,
  Owner,
  QueryString,
  SyncWorkerPost,
} from "./Types.js";

export const sync = (
  queries: ReadonlyArray.NonEmptyReadonlyArray<QueryString> | null
): Effect.Effect<
  | Db
  | Owner
  | SyncWorkerPost
  | IsSyncing
  | DbWorkerRowsCache
  | DbWorkerOnMessage
  | Config,
  never,
  void
> =>
  Effect.gen(function* ($) {
    const isSyncing = yield* $(IsSyncing);
    if (yield* $(isSyncing)) return;
    if (queries != null) yield* $(query({ queries }));

    const [clock, syncWorkerPost, config, owner] = yield* $(
      Effect.all(readClock, SyncWorkerPost, Config, Owner)
    );

    syncWorkerPost({
      syncUrl: config.syncUrl,
      clock,
      owner,
      messages: ReadonlyArray.empty(),
      previousDiff: null,
    });
  });
