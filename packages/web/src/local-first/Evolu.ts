import {
  exhaustiveCheck,
  tryAsync,
  trySync,
  type ConsoleDep,
  type ReloadApp,
  type ReloadAppDep,
  type UnsupportedDbVersionError,
} from "@evolu/common";
import type {
  SharedWorker as CommonSharedWorker,
  CreateDbWorker,
  DbWorkerInit,
  Evolu,
  EvoluDeps,
  RequestPersistentStorageDep,
  SharedWorkerId,
  SharedWorkerInput,
  SharedWorkerOutput,
} from "@evolu/common/local-first";
import {
  BuildWaiting,
  BuildWaitingRequest,
  buildsBroadcastChannelName,
  createEvoluDeps as createCommonEvoluDeps,
} from "@evolu/common/local-first";
import { reloadApp } from "../Platform.ts";
import {
  createBroadcastChannel,
  createMessageChannel,
  createSharedWorker,
  createWorker,
  installOneTabSharedWorkerPolyfill,
} from "../Worker.ts";

export interface SharedWorkerUnsupported {
  readonly type: "SharedWorkerUnsupported";
}

export interface SharedWorkerUnsupportedDep {
  readonly onSharedWorkerUnsupported: () => void;
}

/**
 * Creates Evolu dependencies for the web platform.
 *
 * When another build of the app waits for this one, this tab reloads to load
 * the build the server now serves: at once if the user is not in the tab,
 * otherwise once they leave it. See Builds in the Shared module of
 * `@evolu/common`. A tab whose database refuses to start with
 * {@link UnsupportedDbVersionError} reloads once for each stored version, even
 * while the user is in it, because the server may now serve a build that
 * supports the database. The error is reported when the reloaded build refuses
 * it too, or when the tab has no session storage. A tab whose worker was
 * relaunched without its state, as WebKit does when the process hosting it
 * ends, also reloads at once.
 *
 * When the page enters the browser's back-forward cache, as Safari does on
 * every navigation away, this tab ends its part as if it closed: it stops the
 * database workers it hosts, so another tab takes them over, the shared worker
 * ends this tab's Evolu instances, and the tab reloads if the user comes back
 * to it.
 *
 * Where the browser offers no persistent storage, as in Safari's Private
 * Browsing or a Firefox private window, the database is kept in memory, and
 * {@link Evolu.devicePersistence} resolves to `NotPersisted`, so the app can
 * tell the user. Data that exists only locally, or has not synced yet, is lost
 * when the tab hosting the database closes or navigates away, even while other
 * tabs stay open.
 *
 * After the first local mutation of a database the browser stores, this tab
 * asks the browser once with `navigator.storage.persist()` not to delete the
 * site's data when disk space runs low. Chrome and Safari decide silently, and
 * Firefox asks the user, so every tab asks until the user allows it. A custom
 * {@link RequestPersistentStorageDep.requestPersistentStorage} replaces the
 * request, for example with `constVoid` to never ask. See [Will my data stay on
 * the
 * device?](https://www.evolu.dev/docs/faq#will-my-data-stay-on-the-device).
 *
 * A custom {@link ReloadApp} replaces the default page reload, for example to
 * save state first. It should end by reloading the page, because the other
 * build waits until this tab reloads or closes, and a page restored from the
 * back-forward cache cannot work until it reloads.
 */
export const createEvoluDeps = (
  deps: Partial<ConsoleDep> &
    Partial<ReloadAppDep> &
    Partial<SharedWorkerUnsupportedDep> &
    Partial<RequestPersistentStorageDep> = {},
): EvoluDeps => {
  installOneTabSharedWorkerPolyfill();
  const reloadThisApp = deps.reloadApp ?? reloadApp;
  // A page an automatic reload loaded never announces its build, so two builds
  // cannot keep reloading each other.
  const isAutomaticReload = takeAutomaticReload();
  // Waiting workers this tab already reloaded for. A reload that loaded the
  // running build again did not help, so the tab does not repeat it.
  const reloadedForWorkerIds = getReloadedForWorkerIds();
  // Versions a refusal already reloaded this tab for, read once, so every
  // refusal before this page unloads reloads it.
  const refusalReloadVersions = getRefusalReloadVersions();

  let connectedWorkerId: SharedWorkerId | null = null;
  let waitingWorkerId: SharedWorkerId | null = null;
  // Workers announced before this tab connected. The lock can pass to this
  // tab's worker first, and their tabs may not answer a request, for example
  // when frozen, so the tab handles them once it connects.
  const earlyAnnouncedWorkerIds = new Set<SharedWorkerId>();
  // Checks whether the user left this tab while another build waits.
  let focusCheckId: ReturnType<typeof setInterval> | null = null;
  let isPersistentStorageRequested = false;

  using disposer = new DisposableStack();
  const buildsBroadcastChannel = disposer.use(
    createBroadcastChannel<unknown>(buildsBroadcastChannelName),
  );

  const stopFocusCheck = (): void => {
    if (focusCheckId === null) return;
    clearInterval(focusCheckId);
    focusCheckId = null;
  };
  disposer.defer(stopFocusCheck);

  const announceWaitingBuild = (): void => {
    if (waitingWorkerId === null || isAutomaticReload) return;
    buildsBroadcastChannel.postMessage({
      type: "BuildWaiting",
      workerId: waitingWorkerId,
    } satisfies BuildWaiting);
  };

  const reloadForWaitingBuild = (workerId: SharedWorkerId): void => {
    stopFocusCheck();
    // Without session storage, the reloaded page could announce in turn.
    if (!markAutomaticReload(workerId)) return;
    reloadThisApp();
  };

  const handleWaitingBuild = (workerId: SharedWorkerId): void => {
    if (workerId === connectedWorkerId || reloadedForWorkerIds.has(workerId)) {
      return;
    }
    if (!document.hasFocus()) {
      reloadForWaitingBuild(workerId);
      return;
    }
    // Focus can leave the page from a frame without a window event.
    focusCheckId ??= setInterval(() => {
      if (!document.hasFocus()) reloadForWaitingBuild(workerId);
    }, 1000);
  };

  // Builds of different releases share the channel, so messages are validated.
  buildsBroadcastChannel.onMessage = (message) => {
    if (BuildWaitingRequest.is(message)) {
      announceWaitingBuild();
    } else if (BuildWaiting.is(message)) {
      if (connectedWorkerId === null) {
        earlyAnnouncedWorkerIds.add(message.workerId);
      } else handleWaitingBuild(message.workerId);
    }
  };

  const handleSharedWorkerMessage = (
    message: SharedWorkerOutput | SharedWorkerUnsupported,
    forward: (message: SharedWorkerOutput) => void,
  ): void => {
    // WebKit can relaunch a SharedWorker without its state when the process
    // hosting it ends, and connect the tabs' existing ports to the new worker
    // (https://bugs.webkit.org/show_bug.cgi?id=318873). A worker tells a tab
    // at most once that it waits and once that it connected, both with its own
    // id, so only then does a tab hear from a worker with another id. The
    // tab's state, including the databases it asked for while it waited, ended
    // with the old worker, so it reloads at once.
    const knownWorkerId = connectedWorkerId ?? waitingWorkerId;
    if (
      (message.type === "Waiting" || message.type === "Connected") &&
      knownWorkerId !== null &&
      message.workerId !== knownWorkerId
    ) {
      reloadThisApp();
      return;
    }

    switch (message.type) {
      case "DbWorkerInit": {
        forward(message);
        break;
      }

      case "Error": {
        // The page is about to reload, so the error is not reported.
        if (
          message.error.type === "UnsupportedDbVersionError" &&
          !refusalReloadVersions.has(String(message.error.storedVersion)) &&
          markRefusalReload(message.error)
        ) {
          reloadThisApp();
          break;
        }
        forward(message);
        break;
      }

      case "Waiting": {
        waitingWorkerId = message.workerId;
        announceWaitingBuild();
        forward(message);
        break;
      }

      case "Connected": {
        waitingWorkerId = null;
        connectedWorkerId = message.workerId;
        forward(message);
        for (const workerId of earlyAnnouncedWorkerIds) {
          handleWaitingBuild(workerId);
        }
        // An announcement may have come before this tab started.
        buildsBroadcastChannel.postMessage({
          type: "BuildWaitingRequest",
        } satisfies BuildWaitingRequest);
        break;
      }

      case "SharedWorkerUnsupported": {
        if (deps.onSharedWorkerUnsupported) {
          deps.onSharedWorkerUnsupported();
        } else {
          alert(
            "This browser supports Evolu in one tab only. Close this tab and use the already open tab.",
          );
        }
        break;
      }

      default:
        exhaustiveCheck(message);
    }
  };

  // Disposing the deps ends the DbWorkers this tab hosts, which releases their
  // database locks for the tab that takes over.
  const dbWorkers = new Set<Disposable>();
  disposer.defer(() => {
    for (const dbWorker of dbWorkers) dbWorker[Symbol.dispose]();
  });

  const createDbWorker: CreateDbWorker = () => {
    const dbWorker = createWorker<DbWorkerInit, never>(
      new Worker(new URL("Db.worker.js", import.meta.url), {
        type: "module",
      }),
    );
    dbWorkers.add(dbWorker);
    return dbWorker;
  };

  const webSharedWorker = createSharedWorker<
    SharedWorkerInput,
    SharedWorkerOutput
  >(
    new SharedWorker(new URL("Shared.worker.js", import.meta.url), {
      type: "module",
    }),
  );
  let onSharedWorkerMessage: ((message: SharedWorkerOutput) => void) | null =
    null;
  const sharedWorker: CommonSharedWorker = {
    ...webSharedWorker,
    port: {
      ...webSharedWorker.port,
      get onMessage() {
        return onSharedWorkerMessage;
      },
      set onMessage(fn) {
        onSharedWorkerMessage = fn;
        webSharedWorker.port.onMessage = fn
          ? (message: SharedWorkerOutput | SharedWorkerUnsupported) => {
              handleSharedWorkerMessage(message, fn);
            }
          : null;
      },
    },
  };

  const requestPersistentStorage = (): void => {
    if (isPersistentStorageRequested) return;
    isPersistentStorageRequested = true;
    void tryAsync(async () => {
      if (await navigator.storage.persisted()) return;
      await navigator.storage.persist();
    });
  };

  // Disposing the deps releases the locks this page holds through them, as
  // closing the page would, and a lock granted afterwards is released at once.
  // The SharedWorker learns that an Evolu instance ended when it gets the lock
  // the instance holds. Chrome keeps the locks of a page in its back-forward
  // cache, and a request made before the page entered the cache waits until
  // Chrome drops the page (https://issues.chromium.org/issues/567630881), so
  // the SharedWorker would keep syncing the owners of a cached tab's instances
  // and rerunning their queries.
  let areLocksReleased = false;
  const locksReleased = Promise.withResolvers<void>();
  disposer.defer(() => {
    areLocksReleased = true;
    locksReleased.resolve();
  });

  function requestLock<T>(
    name: string,
    callback: LockGrantedCallback<T>,
  ): Promise<Awaited<T>>;
  function requestLock<T>(
    name: string,
    options: LockOptions,
    callback: LockGrantedCallback<T>,
  ): Promise<Awaited<T>>;
  function requestLock(
    name: string,
    ...args:
      | [LockGrantedCallback<unknown>]
      | [LockOptions, LockGrantedCallback<unknown>]
  ): Promise<unknown> {
    const [options, callback] = args.length === 1 ? [{}, args[0]] : args;
    return navigator.locks.request(name, options, (lock) =>
      areLocksReleased
        ? undefined
        : Promise.race([callback(lock), locksReleased.promise]),
    );
  }

  const evoluDeps = disposer.use(
    createCommonEvoluDeps({
      requestPersistentStorage,
      ...deps,
      createDbWorker,
      createBroadcastChannel,
      createMessageChannel,
      lockManager: {
        query: () => navigator.locks.query(),
        request: requestLock,
      },
      reloadApp: reloadThisApp,
      sharedWorker,
    }),
  );

  // A page entering the back-forward cache is frozen with its DbWorkers, and
  // WebKit keeps their database locks while the page is cached
  // (https://bugs.webkit.org/show_bug.cgi?id=316904), so the other tabs would
  // stall. WebKit also releases the page's own locks, so a restored page would
  // work with state the other tabs gave up on. The page therefore ends its part
  // as if it closed, and reloads when it is shown again.
  const reloadRestoredPage = (event: PageTransitionEvent): void => {
    if (event.persisted) reloadThisApp();
  };
  const handlePageHide = (event: PageTransitionEvent): void => {
    if (!event.persisted) return;
    addEventListener("pageshow", reloadRestoredPage, { once: true });
    disposables.dispose();
  };
  addEventListener("pagehide", handlePageHide);
  disposer.defer(() => {
    removeEventListener("pagehide", handlePageHide);
  });

  const disposables = disposer.move();

  return {
    ...evoluDeps,
    [Symbol.dispose]: () => {
      disposables.dispose();
    },
  };
};

// Marks, for the tab's session, that Evolu reloaded the page for another build.
const automaticReloadKey = "evolu:automatic-reload";
// Holds, for the tab's session, every waiting worker Evolu reloaded it for.
const reloadedForKey = "evolu:reloaded-for";

// Removes the mark, so only the page the reload loaded sees it.
const takeAutomaticReload = (): boolean => {
  const item = trySync(() => {
    const value = sessionStorage.getItem(automaticReloadKey);
    sessionStorage.removeItem(automaticReloadKey);
    return value;
  });
  return item.ok && item.value !== null;
};

const getReloadedForWorkerIds = (): ReadonlySet<string> => {
  const item = trySync(() => sessionStorage.getItem(reloadedForKey));
  return new Set(item.ok && item.value !== null ? item.value.split(",") : []);
};

const markAutomaticReload = (workerId: SharedWorkerId): boolean =>
  trySync(() => {
    const workerIds = new Set(
      sessionStorage.getItem(reloadedForKey)?.split(","),
    );
    workerIds.add(workerId);
    sessionStorage.setItem(reloadedForKey, [...workerIds].join(","));
    sessionStorage.setItem(automaticReloadKey, "1");
  }).ok;

// Holds, for the tab's session, every stored database version a refusal
// reloaded the page for. Each version reloads it once, so refusals of several
// databases cannot keep reloading it, and a build that refuses them again
// reports the error instead.
const refusalReloadKey = "evolu:refusal-reloads";

const getRefusalReloadVersions = (): ReadonlySet<string> => {
  const item = trySync(() => sessionStorage.getItem(refusalReloadKey));
  return new Set(item.ok && item.value !== null ? item.value.split(",") : []);
};

// Adds to the stored versions, which include those marked earlier in this page.
const markRefusalReload = (error: UnsupportedDbVersionError): boolean =>
  trySync(() => {
    const versions = new Set(
      sessionStorage.getItem(refusalReloadKey)?.split(","),
    );
    versions.add(String(error.storedVersion));
    sessionStorage.setItem(refusalReloadKey, [...versions].join(","));
  }).ok;
