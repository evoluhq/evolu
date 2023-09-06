module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      ["@babel/plugin-transform-private-methods", { loose: true }],
      [
        "module-resolver",
        {
          alias: {
            // TODO: Use react-native-quick-crypto once fixed for RN 0.72
            // 'crypto': 'react-native-quick-crypto',
            crypto: "crypto-browserify",
          },
        },
      ],
    ],
  };
};
