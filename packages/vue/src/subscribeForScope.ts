import { getCurrentScope, onScopeDispose } from "vue";

/**
 * Calls `subscribe` and passes what it returns to `onScopeDispose`, so the
 * subscription lasts until the current effect scope, such as the component, is
 * disposed. In a scope that stopped before the call, it subscribes to nothing.
 */
export const subscribeForScope = (subscribe: () => () => void): void => {
  // A scope stopped before the call, such as of a component that unmounted
  // while its async setup awaited, never runs what onScopeDispose registers,
  // so a subscription would leak.
  if (getCurrentScope()?.active === false) return;
  onScopeDispose(subscribe());
};
