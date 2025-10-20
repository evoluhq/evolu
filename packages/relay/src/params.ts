import { Boolean, Number, object, SimpleName } from "@evolu/common";

/**
 * Schema definition for CLI parameters used by the Evolu Relay server.
 *
 * Defines the structure and validation rules for command-line arguments passed
 * to the relay. Uses Evolu's common validation utilities to ensure type safety
 * and proper parameter validation.
 *
 * @example
 *   ```typescript
 *   import { cliParams } from "./params.js";
 *
 *   // Validate unknown input
 *   const result = cliParams.fromUnknown({
 *     name: "my-relay",
 *     port: 3000,
 *     enableLogging: true
 *   });
 *
 *   if (result.ok) {
 *     console.log("Valid params:", result.value);
 *   } else {
 *     console.error("Invalid params:", result.error);
 *   }
 *   ```;
 */
export const cliParams = object({
  /** Database name for the relay server */
  name: SimpleName,
  /** Whether to enable logging output */
  enableLogging: Boolean,
  /** Port number to listen on */
  port: Number,
});

/**
 * TypeScript type representing the validated CLI parameters.
 *
 * This type is automatically inferred from the cliParams schema and provides
 * compile-time type safety for CLI parameter handling.
 */
export type CliParams = typeof cliParams.Type;
