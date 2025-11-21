import { ReloadApp } from "@evolu/common/local-first";

export const reloadApp: ReloadApp = (url: string) => {
  if (typeof document === "undefined") {
    return;
  }

  location.replace(url);
};
