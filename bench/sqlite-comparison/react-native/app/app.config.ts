import type { ExpoConfig } from "expo/config";
import { withAndroidManifest } from "expo/config-plugins";

const config: ExpoConfig = {
  name: "SQLite comparison",
  slug: "sqlite-comparison",
  version: "1.0.0",
  orientation: "portrait",
  ios: {
    bundleIdentifier: "com.evolu.bench.sqlite",
    // The app reaches the runner on the host over plain HTTP.
    infoPlist: { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } },
  },
  android: { package: "com.evolu.bench.sqlite" },
};

// A Release build reaches the runner over plain HTTP, through adb reverse.
export default withAndroidManifest(config, (modConfig) => {
  const [application] = modConfig.modResults.manifest.application ?? [];
  if (application == null) throw new Error("The manifest has no application.");
  application.$["android:usesCleartextTraffic"] = "true";
  return modConfig;
});
