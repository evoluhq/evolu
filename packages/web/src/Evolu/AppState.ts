import { constVoid } from "@evolu/common";
import { AppState, CreateAppState } from "@evolu/common/evolu";

export const createAppState: CreateAppState = (config) => {
  if (typeof document === "undefined") {
    const appState: AppState = {
      reset: constVoid,
    };
    return appState;
  }

  const appState: AppState = {
    reset: () => {
      location.replace(config.reloadUrl);
    },
  };

  return appState;
};
