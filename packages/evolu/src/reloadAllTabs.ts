import { IO } from "fp-ts/IO";

const localStorageKey = "evolu:reloadAllTabs";

if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === localStorageKey) location.reload();
  });

export const reloadAllTabs: IO<void> = () => {
  localStorage.setItem(localStorageKey, Date.now().toString());
  location.reload();
};
