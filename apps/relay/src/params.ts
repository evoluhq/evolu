import { Boolean, Number, object, SimpleName } from "@evolu/common";

export const cliParams = object({
  name: SimpleName,
  enableLogging: Boolean,
  port: Number,
  inMemory: Boolean,
});

export type CliParams = typeof cliParams.Type;
