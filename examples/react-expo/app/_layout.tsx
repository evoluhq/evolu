import { install } from "react-native-quick-crypto";
import { installPolyfills } from "../polyfills";

install();
installPolyfills();

import { Stack } from "expo-router";

export default function RootLayout(): React.ReactNode {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
