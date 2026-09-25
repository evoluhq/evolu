import {
  exhaustiveCheck,
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
  EvoluDeps,
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
 * A custom {@link ReloadApp} replaces the default page reload, for example to
 * save state first. It should end by reloading the page, because the other
 * build waits until this tab reloads or closes.
 */
export const createEvoluDeps = (
  deps: Partial<ConsoleDep> &
    Partial<ReloadAppDep> &
    Partial<SharedWorkerUnsupportedDep> = {},
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
    // (https://bugs.webkit.org/show_bug.cgi?id=318873). Only then does a
    // connected tab hear again that its worker waits or connected. The tab's
    // state ended with the old worker, so it reloads at once.
    if (
      connectedWorkerId !== null &&
      (message.type === "Waiting" || message.type === "Connected")
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

  const createDbWorker: CreateDbWorker = () =>
    createWorker<DbWorkerInit, never>(
      new Worker(new URL("Db.worker.js", import.meta.url), {
        type: "module",
      }),
    );

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

  const evoluDeps = disposer.use(
    createCommonEvoluDeps({
      ...deps,
      createDbWorker,
      createBroadcastChannel,
      createMessageChannel,
      lockManager: navigator.locks,
      reloadApp: reloadThisApp,
      sharedWorker,
    }),
  );
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
