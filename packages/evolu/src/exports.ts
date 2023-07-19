import * as Schema from "@effect/schema/Schema";
import "client-only";
import "effect/Brand";

export type {
  EvoluError,
  Mnemonic,
  Owner,
  OwnerId,
  SyncState,
} from "./Evolu.js";

export { Id, SqliteBoolean, SqliteDate, cast, id } from "./Evolu.js";

/**
 * A string with a maximum length of 1000 characters.
 *
 * ### Example
 *
 * ```
 * import * as Schema from "@effect/schema/Schema";
 * import * as Evolu from "evolu";
 *
 * if (!Schema.is(Evolu.String1000)(value)) return;
 * function foo(value: Evolu.String1000) {}
 * ```
 */
export const String1000 = Schema.string.pipe(
  Schema.maxLength(1000),
  Schema.brand("String1000")
);
export type String1000 = Schema.To<typeof String1000>;

/**
 * A nonempty string with a maximum length of 1000 characters.
 *
 * ### Example
 *
 * ```
 * import * as Schema from "@effect/schema/Schema";
 * import * as Evolu from "evolu";
 *
 * if (!Schema.is(Evolu.NonEmptyString1000)(value)) return;
 * function foo(value: Evolu.NonEmptyString1000) {}
 * ```
 */
export const NonEmptyString1000 = Schema.string.pipe(
  Schema.minLength(1),
  Schema.maxLength(1000),
  Schema.brand("NonEmptyString1000")
);
export type NonEmptyString1000 = Schema.To<typeof NonEmptyString1000>;

/**
 * A positive integer.
 *
 * ### Example
 *
 * ```
 * import * as Schema from "@effect/schema/Schema";
 * import * as Evolu from "evolu";
 *
 * if (!Schema.is(Evolu.PositiveInt)(value)) return;
 * function foo(value: Evolu.PositiveInt) {}
 * ```
 */
export const PositiveInt = Schema.number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.brand("PositiveInt")
);
export type PositiveInt = Schema.To<typeof PositiveInt>;
