module.exports = {
  presets: ["module:@react-native/babel-preset"],
  // In the workspace, Evolu's packages resolve to their TypeScript sources,
  // which declare resources with `using`, which Hermes runs only transformed.
  plugins: ["@babel/plugin-transform-explicit-resource-management"],
};
