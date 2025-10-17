import { Boolean, Number, object, SimpleName } from "@evolu/common";

export const cliParams = object({
  name: SimpleName,
  enableLogging: Boolean,
  port: Number,
});

export type CliParams = typeof cliParams.Type;
