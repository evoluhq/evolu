import { constFalse, flow, pipe } from "@effect/data/Function";
import * as Option from "@effect/data/Option";
import * as Predicate from "@effect/data/Predicate";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import { DbWorker, QueryString } from "./Types.js";

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

export const browserFeatures = {
  opfs: isBrowser && (isChromeWithOpfs() || isFirefoxWithOpfs()),
};

const localStorageKey = "evolu:reloadAllTabs";

export const reloadAllTabs = (reloadUrl: string): void => {
  localStorage.setItem(localStorageKey, Date.now().toString());
  location.assign(reloadUrl);
};

export const browserInit = (
  subscribedQueries: ReadonlyMap<QueryString, number>,
  dbWorker: DbWorker
): void => {
  if (!isBrowser) return;

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

const syncLockName = "evolu:sync";

// TODO: Make it platform independent.
export const requestSync = (sync: () => Promise<void>): void => {
  navigator.locks.request(syncLockName, sync);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const hasLock: Predicate.Predicate<LockInfo[] | undefined> = flow(
  Option.fromNullable,
  Option.map(ReadonlyArray.some((a) => a.name === syncLockName)),
  Option.getOrElse(constFalse)
);

// TODO: Effect<LockManager, UnknownError, boolean>
// TODO: Make it platform independent.
// export const syncIsPendingOrHeld: ReaderTaskEither<
//   LockManagerEnv,
//   UnknownError,
//   boolean
// > = ({ locks }) =>
//   pipe(
//     taskEither.tryCatch(() => locks.query(), errorToUnknownError),
//     taskEither.map(({ pending, held }) => hasLock(pending) || hasLock(held))
//   );
