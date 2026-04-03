module.exports = function (api) {
  api.cache(true);

  /**
   * Remember: If you make a change to the babel.config.js file, you need to
   * restart the Metro bundler to apply the changes and use --clear option from
   * Expo CLI to clear the Metro bundler cache.
   *
   * https://docs.expo.dev/versions/latest/config/babel/
   */

  return {
    // Resolve from this config file's package scope, not monorepo root.
    presets: [require.resolve("babel-preset-expo")],
    plugins: [
      // For Kysely to work with Hermes
      require.resolve("@babel/plugin-transform-dynamic-import"),
      require.resolve("@babel/plugin-transform-modules-commonjs"),
      // For ECMAScript 'using' statement support
      require.resolve("@babel/plugin-transform-explicit-resource-management"),
    ],
  };
};
