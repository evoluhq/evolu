import type { ConsoleDep, ReloadAppDep } from "@evolu/common";
import type { EvoluDeps } from "@evolu/common/local-first";
import {
  createEvoluDeps as createWebEvoluDeps,
  type SharedWorkerUnsupportedDep,
  type StorageUnavailableDep,
} from "@evolu/web";
import { flushSync } from "react-dom";

/**
 * Creates shared Evolu dependencies for React on web with React DOM flush sync.
 *
 * It accepts the same options as `createEvoluDeps` from `@evolu/web`.
 */
export const createEvoluDeps = (
  deps: Partial<ConsoleDep> &
    Partial<ReloadAppDep> &
    Partial<SharedWorkerUnsupportedDep> &
    Partial<StorageUnavailableDep> = {},
): EvoluDeps => ({
  ...createWebEvoluDeps(deps),
  flushSync: (callback) => {
    flushSync(callback);
  },
});
