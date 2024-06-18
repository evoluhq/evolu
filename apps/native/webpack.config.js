const createExpoWebpackConfigAsync = require("@expo/webpack-config");

const path = require("path");

const appDirectory = path.resolve(__dirname);
const webpack = require("webpack");
const { getExpoBabelLoader } = require("@expo/webpack-config/utils");

// This is needed for webpack to compile JavaScript.
// Many OSS React Native packages are not compiled to ES5 before being
// published. If you depend on uncompiled packages they may cause webpack build
// errors. To fix this webpack can be configured to compile to the necessary
// `node_module`.
const babelLoaderConfiguration = {
  include: [path.resolve(appDirectory, "node_modules/vm-browserify")],
  use: {
    loader: "babel-loader",
    options: {
      cacheDirectory: true,
      presets: [
        "babel-preset-expo",
        [
          "module:metro-react-native-babel-preset",
          { useTransformReactJSXExperimental: true },
        ],
        "@babel/preset-react",
        ["@babel/preset-env", { loose: true, modules: false }],
        "@babel/preset-typescript",
        "@babel/preset-flow",
      ],
      plugins: [
        "react-native-web",
        "@babel/plugin-syntax-import-attributes",
        "@babel/plugin-proposal-export-namespace-from",
        "@babel/plugin-transform-modules-amd",
        ["@babel/plugin-transform-private-property-in-object", { loose: true }],
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
    },
  },
};

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);
  let babel = getExpoBabelLoader(config);
  if (babel) {
    babel.use = babelLoaderConfiguration.use;
  }
  config.entry = [path.resolve(appDirectory, "index.js")];

  config.resolve = {
    ...config.resolve,
    alias: {
      ...config.resolve.alias,
      crypto: "crypto-browserify",
      vm: "vm-browserify",
    },
    extensions: [
      ...config.resolve.extensions,
      ".web.ts",
      ".web.tsx",
      ".tsx",
      ".ts",
      ".js",
      ".cjs",
    ],
  };

  (config.devServer = {
    https: false,

    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  }),
    (config.plugins = [
      ...config.plugins,
      new webpack.ProvidePlugin({
        React: "react",
      }),
    ]);

  // console.info('webpack config', JSON.stringify(config, undefined, 2))
  return config;
};
