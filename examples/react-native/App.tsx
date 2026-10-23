// Opened at evolurn://native-tests, the app runs the device suites of
// @evolu/react-native for scripts/device-tests.mts. They run only inside the
// repository, which this imports them from. React Native keeps the URL across a
// reload.
import { assertEqual } from "@evolu/common";
import { createEvoluDeps } from "@evolu/react-native";
import { useEffect, type FC } from "react";
import { Linking, Platform, Text, View } from "react-native";
import { runDeviceTests } from "../../packages/react-native/test/device/runner.ts";

// Once per runtime, though a development build runs effects twice.
let started = false;

const App: FC = () => {
  useEffect(() => {
    if (started) return;
    started = true;
    void Linking.getInitialURL().then((url) => {
      if (url !== "evolurn://native-tests") return;
      void runDeviceTests({
        platform: Platform.OS === "ios" ? "ios" : "android",
        assertEqual,
        createEvoluDeps,
      });
    });
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Evolu without Expo</Text>
    </View>
  );
};

export default App;
