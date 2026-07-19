/**
 * Node.js platform utilities.
 *
 * @module
 */

import { PositiveInt } from "@evolu/common";
import { availableParallelism as nodeAvailableParallelism } from "node:os";

/** Returns the recommended amount of parallelism available to this process. */
export const availableParallelism = (): PositiveInt =>
  PositiveInt.orThrow(nodeAvailableParallelism());
