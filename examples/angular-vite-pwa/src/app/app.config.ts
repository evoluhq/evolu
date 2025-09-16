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
  name: getOrThrow(SimpleName.from("angular-vite-pwa")),

  ...(typeof window !== "undefined" &&
    window.location.hostname === "localhost" && {
      syncUrl: "http://localhost:4000",
    }),

  onInit: ({ isFirst }) => {
    if (isFirst) {
      const todoCategoryId = getOrThrow(
        evolu.insert("todoCategory", {
          name: "Not Urgent",
        }),
      );

      evolu.insert("todo", {
        title: "Try Angular Signals",
        categoryId: todoCategoryId.id,
        // This object is automatically converted to a JSON string.
        personJson: { name: "Joe", age: 32 },
      });
    }
  },

  // Indexes are not required for development but are recommended for production.
  // https://www.evolu.dev/docs/indexes
  indexes: (create) => [
    create("todoCreatedAt").on("todo").column("createdAt"),
    create("todoCategoryCreatedAt").on("todoCategory").column("createdAt"),
  ],

  // enableLogging: true,
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
