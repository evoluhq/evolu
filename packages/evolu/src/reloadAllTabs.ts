import { IO } from "fp-ts/IO";
import { config } from "./config";

const localStorageKey = "evolu:reloadAllTabs";

if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === localStorageKey) location.reload();
  });

export const reloadAllTabs: IO<void> = () => {
  localStorage.setItem(localStorageKey, Date.now().toString());
  location.assign(config.reloadUrl);
};
