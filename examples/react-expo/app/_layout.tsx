import { install as installQuickCryptoPolyfills } from "react-native-quick-crypto";
import { installPolyfills as installReactNativePolyfills } from "@evolu/react-native/polyfills";

installQuickCryptoPolyfills();
installReactNativePolyfills();

import { Stack } from "expo-router";
import type { FC } from "react";

const RootLayout: FC = () => (
  <Stack
    screenOptions={{
      headerShown: false,
    }}
  />
);

export default RootLayout;
