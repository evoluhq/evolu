/** @type {(api: { readonly cache: (enabled: boolean) => void }) => object} */
module.exports = function (api) {
  api.cache(true);
  const presetExpo = require.resolve("babel-preset-expo");
  return {
    presets: [presetExpo],
    overrides: [
      // The app shares the benchmark's .mts modules, which babel-preset-expo
      // doesn't take for TypeScript. Its own copy of the plugin strips them.
      // A function, as Metro first loads the config without a file.
      {
        test: (/** @type {string | undefined} */ fileName) =>
          fileName?.endsWith(".mts") === true,
        plugins: [
          [
            require.resolve("@babel/plugin-transform-typescript", {
              paths: [presetExpo],
            }),
            { allowNamespaces: true },
          ],
        ],
      },
    ],
  };
};
