import { install } from "react-native-quick-crypto";

install();

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
