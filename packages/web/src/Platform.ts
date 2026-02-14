import type { LeaderLock, ReloadApp } from "@evolu/common";
import { ok } from "@evolu/common";

export const leaderLock: LeaderLock = {
  acquire: (name) => async () => {
    const acquired = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();

    void globalThis.navigator.locks.request(
      `evolu-leader-${name}`,
      { mode: "exclusive" },
      async () => {
        acquired.resolve();
        await release.promise;
      },
    );

    await acquired.promise;

    return ok({
      [Symbol.dispose]: () => {
        release.resolve();
      },
    });
  },
};

export const reloadApp: ReloadApp = (url) => {
  if (typeof document === "undefined") {
    return;
  }

  location.replace(url ?? "/");
};
