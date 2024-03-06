import { Config } from "@evolu/common";
import * as Effect from "effect/Effect";

/**
 * In software development, "multitenant" refers to an architecture where a
 * single instance of a software application serves multiple customers, clients,
 * or organizations, known as "tenants."
 */
export const multitenantLockName = (
  name: "Sqlite" | "DbWorker",
): Effect.Effect<string, never, Config> =>
  Effect.gen(function* (_) {
    const config = yield* _(Config);
    return `evolu:${config.name}:${name}`;
  });
