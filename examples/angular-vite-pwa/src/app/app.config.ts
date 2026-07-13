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

run.deps.evoluError.subscribe(() => {
  const error = run.deps.evoluError.get();
  if (!error) return;

  alert("🚨 Evolu error occurred! Check the console.");
});

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
export const EVOLU = new InjectionToken<Evolu.Evolu<typeof Schema>>("Evolu");

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    { provide: EVOLU, useValue: evolu },
  ],
};
