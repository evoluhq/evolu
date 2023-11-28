module.exports = {
  plugins: ["@typescript-eslint", "node", "jsdoc"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "plugin:jsdoc/recommended-error",
    "plugin:jsdoc/recommended-typescript-error",
    "next/core-web-vitals",
    "turbo",
    "prettier",
  ],
  rules: {
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-floating-promises": "off",
    "react-hooks/exhaustive-deps": "error",
    "no-console": "error",
    "import/no-cycle": "error",
    "@next/next/no-html-link-for-pages": "off",
    "jsdoc/require-jsdoc": "off",
    "jsdoc/require-param": "off",
    "jsdoc/require-returns": "off",
    "jsdoc/tag-lines": [
      "error",
      "any",
      {
        startLines: 1,
        tags: { param: { lines: "never" } },
      },
    ],
  },
  parser: "@typescript-eslint/parser",

  settings: {
    "import/ignore": ["node_modules/react-native/index\\.js$"],
  },

  parserOptions: {
    babelOptions: {
      presets: [require.resolve("next/babel")],
    },
    project: ["./apps/*/tsconfig.json", "./packages/*/tsconfig.json"],
    tsconfigRootDir: __dirname,
  },
};
