import { install as installQuickCryptoPolyfills } from "react-native-quick-crypto";
import { installPolyfills as installReactNativePolyfills } from "@evolu/react-native/polyfills";

installQuickCryptoPolyfills();
installReactNativePolyfills();

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
