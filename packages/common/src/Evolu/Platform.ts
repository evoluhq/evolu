import { Config } from "./Config.js";

/**
 * FlushSync is for libraries like React to flush updates synchronously inside
 * the provided callback to ensure the DOM is updated immediately.
 *
 * For example, with React, when we want to focus on an element rendered as a
 * result of a mutation, Evolu ensures all DOM changes are flushed synchronously
 * if an onComplete callback is used.
 *
 * https://react.dev/reference/react-dom/flushSync
 */
export type FlushSync = (callback: () => void) => void;

export interface FlushSyncDep {
  readonly flushSync: FlushSync;
}

export interface AppState {
  readonly reset: () => void;
}

export type CreateAppState = (config: Config) => AppState;

export interface CreateAppStateDep {
  readonly createAppState: CreateAppState;
}
