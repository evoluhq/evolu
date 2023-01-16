import { IO } from "fp-ts/IO";

const localStorageKey = "evolu:reloadAllTabs";

if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === localStorageKey) location.reload();
  });

export const reloadAllTabs =
  (reloadUrl: string): IO<void> =>
  () => {
    localStorage.setItem(localStorageKey, Date.now().toString());
    location.assign(reloadUrl);
  };
