// The polyfills come first, before anything that imports Evolu, which reads
// randomness when it's imported. Imports evaluate in order.
import "./polyfills"; // oxlint-disable-line import/no-unassigned-import -- Installs the polyfills, which must run first.
import { AppRegistry } from "react-native";
import App from "./App";
import { name as appName } from "./app.json";

AppRegistry.registerComponent(appName, () => App);
