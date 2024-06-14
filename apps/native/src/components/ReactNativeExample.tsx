import { FC, Suspense, startTransition, useState } from "react";
import { Button, Text, View } from "react-native";

import { EvoluProvider } from "@evolu/react-native";
import { evolu } from "../db/db";
import { NotificationBar } from "../components/NotificationBar";
import { TodoCategories } from "../components/TodoCategories";
import { Todos } from "../components/Todos";
import { OwnerActions } from "../components/OwnerActions";

export const ReactNativeExample: FC = () => {
  const [todosShown, setTodosShown] = useState(true);

  return (
    <EvoluProvider value={evolu}>
      <OwnerActions />
      <View style={{ alignItems: "flex-start" }}>
        <Button
          title="Simulate suspense-enabled router"
          onPress={() => {
            // https://react.dev/reference/react/useTransition#building-a-suspense-enabled-router
            startTransition(() => {
              setTodosShown(!todosShown);
            });
          }}
        />
        <Text>
          Using suspense-enabled router transition, you will not see any loader
          or jumping content.
        </Text>
      </View>
      <Suspense>{todosShown ? <Todos /> : <TodoCategories />}</Suspense>
      <NotificationBar />
    </EvoluProvider>
  );
};
