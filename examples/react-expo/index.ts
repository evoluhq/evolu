// The polyfills come first, before anything that imports Evolu, which reads
// randomness when it's imported. Imports evaluate in order.
import "./polyfills"; // oxlint-disable-line import/no-unassigned-import -- Installs the polyfills, which must run first.
import "expo-router/entry"; // oxlint-disable-line import/no-unassigned-import -- Starts Expo Router, which registers the app.
