import {
  ApplicationConfig,
  InjectionToken,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core";
import { createEvolu, Evolu, getOrThrow, SimpleName } from "@evolu/common";
import { evoluWebDeps } from "@evolu/web";
import { Schema } from "./schema";

const evolu = createEvolu(evoluWebDeps)(Schema, {
  name: getOrThrow(SimpleName.from("angular-vite-pwa-minimal")),

  // ...(typeof window !== "undefined" &&
  //   window.location.hostname === "localhost" && {
  //     transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
  //   }),
});

// This injection token allows us to use Angular's dependency injection to get
// the Evolu instance above within Angular components and services.
export const EVOLU = new InjectionToken<Evolu<typeof Schema>>("Evolu");

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    { provide: EVOLU, useValue: evolu },
  ],
};
