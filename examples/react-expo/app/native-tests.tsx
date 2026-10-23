// The device route, myapp://native-tests, which runs the device suites of
// @evolu/react-native for scripts/device-tests.mts. They run only inside the
// repository, which this imports them from.
import { assertEqual } from "@evolu/common";
import { createEvoluDeps } from "@evolu/react-native";
import { useEffect, type FC } from "react";
import { Platform, Text, View } from "react-native";
import { runDeviceTests } from "../../../packages/react-native/test/device/runner.ts";

// Once per runtime, though a development build runs effects twice.
let started = false;

const NativeTests: FC = () => {
  useEffect(() => {
    if (started) return;
    started = true;
    void runDeviceTests({
      platform: Platform.OS === "ios" ? "ios" : "android",
      assertEqual,
      createEvoluDeps,
    });
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Running the device tests</Text>
    </View>
  );
};

export default NativeTests;
