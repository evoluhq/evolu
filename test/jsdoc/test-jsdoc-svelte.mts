import type { EvoluDeps } from "../../packages/common/src/local-first/index.ts";
import { createDocsEvoluDeps } from "./test-jsdoc-evolu-deps.mts";

/**
 * Node.js has no web workers, so examples run Evolu in-process. `queryState` is
 * missing because its runes need the Svelte compiler and a component.
 */
export const evoluSvelteDeps: EvoluDeps = /*#__PURE__*/ createDocsEvoluDeps();
