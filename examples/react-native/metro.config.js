const path = require("path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

// The workspace hoists packages to the repository's root, and the device suites
// live in packages/react-native, outside this app.
const root = path.resolve(__dirname, "../..");

/** @type {import("@react-native/metro-config").MetroConfig} */
const config = {
  watchFolders: [root],
  resolver: {
    // With the root watched, Metro would crawl the examples' native builds.
    blockList: [
      /\/examples\/[^/]+\/ios\/(Pods|build)\/.*/u,
      /\/examples\/[^/]+\/android\/(.+\/)?build\/.*/u,
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
