import type { ReloadApp } from "@evolu/common";

export const reloadApp: ReloadApp = (url) => {
  if (typeof document === "undefined") {
    return;
  }

  location.replace(url ?? "/");
};
