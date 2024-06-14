import { useEvoluError } from "@evolu/react-native";
import { FC, useEffect, useState } from "react";
import { Button, Text, View } from "react-native";
export const NotificationBar: FC = () => {
  const evoluError = useEvoluError();
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (evoluError) setShowError(true);
  }, [evoluError]);

  if (!evoluError || !showError) return null;

  return (
    <View>
      <Text>{`Error: ${JSON.stringify(evoluError)}`}</Text>
      <Button title="Close" onPress={() => setShowError(false)} />
    </View>
  );
};
