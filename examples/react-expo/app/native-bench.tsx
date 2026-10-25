// The benchmark route, myapp://native-bench, or myapp://native-bench?memory=
// <point> for a memory launch, which runs @evolu/react-native's device bench
// for scripts/device-bench.mts. It runs only inside the repository, which this
// imports it from.
import { createConsole } from "@evolu/common";
import { createEvoluDeps } from "@evolu/react-native";
import { useLocalSearchParams } from "expo-router";
import { useEffect, type FC } from "react";
import { Platform, Text, View } from "react-native";
import { runDeviceBench } from "../../../packages/react-native/test/device/bench.ts";
import { createReactNativeSqliteDriver } from "../../../packages/react-native/src/sqlite/Driver.ts";
import {
  loadEvoluApp,
  loadNativeSqlite,
} from "../../../packages/react-native/src/sqlite/Loader.ts";

// Once per runtime, though a development build runs effects twice.
let started = false;

const NativeBench: FC = () => {
  const { memory } = useLocalSearchParams<{ memory?: string }>();

  useEffect(() => {
    if (started) return;
    started = true;
    void runDeviceBench({
      build: "evolu",
      platform: Platform.OS,
      // A number on Android and a string on iOS.
      os: String(Platform.Version),
      dev: __DEV__,
      nodeEnv: process.env.NODE_ENV,
      createEvoluDeps: () =>
        createEvoluDeps({ console: createConsole({ level: "warn" }) }),
      createSqliteDriver: createReactNativeSqliteDriver({
        nativeSqlite: loadNativeSqlite(),
        databaseDirectory: loadEvoluApp().getDatabaseDirectory(),
      }),
      memory,
    });
  }, [memory]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Running the benchmark</Text>
    </View>
  );
};

export default NativeBench;
