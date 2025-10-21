import { Boolean, Number, object, SimpleName } from "@evolu/common";

export const CliParams = object({
  /** Database name for the relay server */
  name: SimpleName,
  /** Whether to enable logging output */
  enableLogging: Boolean,
  /** Port number to listen on */
  port: Number,
});

export type CliParams = typeof CliParams.Type;
