import { ScrollView, Text } from "react-native";
import { appStyles } from "./styles";
import { ReactNativeExample } from "./components/ReactNativeExample";

export default function App() {
  return (
    <ScrollView style={appStyles.container}>
      <Text style={appStyles.h1}>React Native Example</Text>
      <ReactNativeExample />
    </ScrollView>
  );
}
