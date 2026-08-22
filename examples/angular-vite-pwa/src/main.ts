import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "./app/app.config";
import { App } from "./app/app.component";

bootstrapApplication(App, appConfig).catch((err) => {
  // oxlint-disable-next-line eslint/no-console -- Angular bootstrap failures must remain visible to developers.
  console.error(err);
});
