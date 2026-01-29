import { createContext, useContext } from "react";
import { create } from "zustand";

export const IsInsideMobileNavigationContext =
  /*#__PURE__*/ createContext(false);

export const useIsInsideMobileNavigation = (): boolean =>
  useContext(IsInsideMobileNavigationContext);

export const useMobileNavigationStore = /*#__PURE__*/ create<{
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}>()((set) => ({
  isOpen: false,
  open: () => {
    set({ isOpen: true });
  },
  close: () => {
    set({ isOpen: false });
  },
  toggle: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },
}));
