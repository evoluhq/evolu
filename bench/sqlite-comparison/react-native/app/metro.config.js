const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// The app shares the benchmark's .mts modules.
config.resolver.sourceExts.push("mts");

module.exports = config;
