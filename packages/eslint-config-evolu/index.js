module.exports = {
  plugins: ["@typescript-eslint", "node", "jsdoc"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "plugin:jsdoc/recommended-error",
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
    "jsdoc/require-returns": "off",
    "jsdoc/require-param": "off",
    "jsdoc/require-param-type": "off",
    "jsdoc/require-jsdoc": "off",
  },
  parser: "@typescript-eslint/parser",

  // https://github.com/typescript-eslint/typescript-eslint/issues/1333#issuecomment-573345631
  settings: {
    "import/resolver": {
      typescript: {},
    },
  },

  parserOptions: {
    babelOptions: {
      presets: [require.resolve("next/babel")],
    },
    project: ["./apps/*/tsconfig.json", "./packages/*/tsconfig.json"],
    tsconfigRootDir: __dirname,
  },
};
