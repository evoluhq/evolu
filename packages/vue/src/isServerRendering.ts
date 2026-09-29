import { inject, ssrContextKey } from "vue";

/**
 * Returns whether the current component renders on the server.
 *
 * Vue never disposes the effect scope of a component rendered on the server, so
 * a composable must not subscribe or register anything there that needs
 * cleanup. The server renderer provides its context under `ssrContextKey`,
 * which `useSSRContext` reads too, but that warns when called on the client.
 */
export const isServerRendering = (): boolean =>
  // Outside a component or app, inject returns undefined, not the default.
  inject(ssrContextKey, null) != null;
