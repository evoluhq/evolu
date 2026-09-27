import {
  ApplicationConfig,
  InjectionToken,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core";
import * as Evolu from "@evolu/common";
import { createEvoluDeps, createRun } from "@evolu/web";
import { Schema } from "./schema";

const run = createRun(
  createEvoluDeps({
    console: Evolu.createConsole({
      level: "debug",
      formatter: Evolu.createConsoleFormatter()({
        timestampFormat: "relative",
      }),
    }),
  }),
);

const evolu = await run.ok(
  Evolu.createEvolu(Schema, {
    appName: Evolu.AppName.orThrow("angular-vite-pwa-minimal"),
    appOwner: Evolu.testAppOwner,

    ...(import.meta.env.DEV && {
      transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
    }),
  }),
);

// This injection token allows us to use Angular's dependency injection to get
// the Evolu instance above within Angular components and services.
export const EVOLU = /*#__PURE__*/ new InjectionToken<
  Evolu.Evolu<typeof Schema>
>("Evolu");

// Shared by all Evolu instances created from these deps.
export const EVOLU_ERROR = /*#__PURE__*/ new InjectionToken<
  Evolu.ReadonlyStore<Evolu.EvoluError | null>
>("EvoluError");

export const appConfig: ApplicationConfig = {
  providers: [
    /*#__PURE__*/ provideBrowserGlobalErrorListeners(),
    /*#__PURE__*/ provideZonelessChangeDetection(),
    { provide: EVOLU, useValue: evolu },
    { provide: EVOLU_ERROR, useValue: run.deps.evoluError },
  ],
};
