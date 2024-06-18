module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      "@babel/plugin-syntax-import-attributes",
      // For Kysely to work with Hermes
      ["@babel/plugin-transform-private-methods", { loose: true }],
      // For Kysely to work with Hermes
      "@babel/plugin-transform-dynamic-import",
      [
        "module-resolver",
        {
          alias: {
            crypto: "crypto-browserify",
            vm: "vm-browserify",
          },
        },
      ],
    ],
  };
};
