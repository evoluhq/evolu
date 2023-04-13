import { pipe } from "@effect/data/Function";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Db from "./Db.js";
import * as DbWorker from "./DbWorker.js";

export const isBrowser = typeof window !== "undefined" && !("Deno" in window);

const isChromeWithOpfs = (): boolean =>
  navigator.userAgentData != null &&
  navigator.userAgentData.brands.find(
    ({ brand, version }) =>
      // Chrome or Chromium
      brand.includes("Chrom") && Number(version) >= 109
  ) != null;

const isFirefoxWithOpfs = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.indexOf("firefox") === -1) return false;
  const matches = userAgent.match(/firefox\/([0-9]+\.*[0-9]*)/);
  if (matches == null) return false;
  return Number(matches[1]) >= 111;
};

export const features = {
  opfs: isBrowser && (isChromeWithOpfs() || isFirefoxWithOpfs()),
};

const localStorageKey = "evolu:reloadAllTabs";

if (isBrowser)
  window.addEventListener("storage", (e) => {
    if (e.key === localStorageKey) location.reload();
  });

export const reloadAllTabs = (reloadUrl: string): void => {
  localStorage.setItem(localStorageKey, Date.now().toString());
  location.assign(reloadUrl);
};

export const initReconnectAndReshow = (
  subscribedQueries: ReadonlyMap<Db.QueryString, number>,
  dbWorker: DbWorker.DbWorker
): void => {
  if (!isBrowser) return;

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
