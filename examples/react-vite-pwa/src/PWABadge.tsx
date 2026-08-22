import "./PWABadge.css";

import type { ReactElement } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const PWABadge = (): ReactElement => {
  // check for updates every hour
  const period = 60 * 60 * 1000;

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (period <= 0) return;
      if (r?.active?.state === "activated") {
        registerPeriodicSync(period, swUrl, r);
      } else if (r?.installing) {
        r.installing.addEventListener("statechange", (e) => {
          const sw = e.target as ServiceWorker;
          if (sw.state === "activated") registerPeriodicSync(period, swUrl, r);
        });
      }
    },
  });

  const close = (): void => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="PWABadge" role="alert" aria-labelledby="toast-message">
      {(offlineReady || needRefresh) && (
        <div className="PWABadge-toast">
          <div className="PWABadge-message">
            {offlineReady ? (
              <span id="toast-message">App ready to work offline</span>
            ) : (
              <span id="toast-message">
                New content available, click on reload button to update.
              </span>
            )}
          </div>
          <div className="PWABadge-buttons">
            {needRefresh && (
              <button
                className="PWABadge-toast-button"
                onClick={() => {
                  void updateServiceWorker(true).catch((error: unknown) => {
                    // oxlint-disable-next-line eslint/no-console -- Service worker update failures must remain visible to developers.
                    console.error(error);
                  });
                }}
              >
                Reload
              </button>
            )}
            <button className="PWABadge-toast-button" onClick={() => close()}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PWABadge;

/**
 * This function will register a periodic sync check every hour, you can modify
 * the interval as needed.
 */
const registerPeriodicSync = (
  period: number,
  swUrl: string,
  r: ServiceWorkerRegistration,
): void => {
  if (period <= 0) return;

  setInterval(() => {
    if ("onLine" in navigator && !navigator.onLine) return;

    void (async () => {
      const resp = await fetch(swUrl, {
        cache: "no-store",
        headers: {
          cache: "no-store",
          "cache-control": "no-cache",
        },
      });

      if (resp.status === 200) await r.update();
    })().catch((error: unknown) => {
      // oxlint-disable-next-line eslint/no-console -- Periodic update failures must remain visible to developers.
      console.error(error);
    });
  }, period);
};
