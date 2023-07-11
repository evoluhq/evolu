import { pipe } from "@effect/data/Function";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import { DbWorker, Query } from "./Types.js";

const localStorageKey = "evolu:reloadAllTabs";

export const reloadAllTabs = (reloadUrl: string): void => {
  localStorage.setItem(localStorageKey, Date.now().toString());
  location.assign(reloadUrl);
};

export const browserInit = (
  subscribedQueries: ReadonlyMap<Query, number>,
  dbWorker: DbWorker
): void => {
  window.addEventListener("storage", (e) => {
    if (e.key === localStorageKey) location.reload();
  });

  const sync = (refreshQueries: boolean) => () => {
    dbWorker.post({
      _tag: "sync",
      queries: refreshQueries
        ? pipe(Array.from(subscribedQueries.keys()), (a) =>
            ReadonlyArray.isNonEmptyReadonlyArray(a) ? a : null
          )
        : null,
    });
  };

  const handleReconnect = sync(false);
  const handleReshow = sync(true);

  window.addEventListener("online", handleReconnect);
  window.addEventListener("focus", handleReshow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") handleReshow();
  });

  handleReconnect();
};
