import "client-only";

export * from "./Model.js";
export type {
  EvoluError,
  Mnemonic,
  Owner,
  OwnerId,
  SyncState,
} from "./Types.js";

import * as Schema from "@effect/schema/Schema";
import * as Evolu from "./Evolu.js";
import * as Platform from "./Platform.js";
import * as React from "./React.js";
import * as Types from "./Types.js";

/**
 * To create `Evolu.create` for a platform.
 */
export const createEvoluCreate =
  (platformName?: Platform.PlatformName) =>
  <From, To extends Types.Schema>(
    schema: Schema.Schema<From, To>,
    config?: Partial<Types.Config>
  ): React.Hooks<To> =>
    React.createHooks(Evolu.createEvolu(schema, config, platformName));
