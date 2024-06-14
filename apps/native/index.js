// Soon will not be required https://github.com/facebook/hermes/issues/948
import "fast-text-encoding";
import "react-native-get-random-values";

import { registerRootComponent } from "expo";

import App from "./src/App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in the Expo client or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
