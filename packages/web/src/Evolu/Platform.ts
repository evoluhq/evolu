import { ReloadApp } from "@evolu/common/evolu";

export const reloadApp: ReloadApp = (url: string) => {
  if (typeof document === "undefined") {
    return;
  }

  location.replace(url);
};
