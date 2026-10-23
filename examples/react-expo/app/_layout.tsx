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
