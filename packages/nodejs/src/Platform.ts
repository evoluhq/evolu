/**
 * Node.js platform utilities.
 *
 * @module
 */

import { PositiveInt } from "@evolu/common";
import { availableParallelism as nodeAvailableParallelism } from "node:os";

/** Returns the recommended amount of parallelism available to this process. */
export type AvailableParallelism = () => PositiveInt;

/** Dependency wrapper for {@link availableParallelism}. */
export interface AvailableParallelismDep {
  readonly availableParallelism: AvailableParallelism;
}

/** Returns the recommended amount of parallelism available to this process. */
export const availableParallelism: AvailableParallelism = () =>
  PositiveInt.orThrow(nodeAvailableParallelism());
