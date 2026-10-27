import { useEffect, useState, type FC } from "react";
import { Text, View } from "react-native";
import { runReactNativeBench } from "./bench.ts";

// Once per runtime, though a development build runs effects twice.
let started = false;

export const App: FC = () => {
  const [status, setStatus] = useState("Starting");

  useEffect(() => {
    if (started) return;
    started = true;
    void runReactNativeBench(setStatus);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Text>SQLite comparison</Text>
      <Text>{status}</Text>
    </View>
  );
};
