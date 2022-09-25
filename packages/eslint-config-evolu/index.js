module.exports = {
  plugins: ["functional", "node"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
    "plugin:functional/lite",
    "plugin:functional/stylistic",
    "plugin:functional/external-recommended",
    "next/core-web-vitals",
    "turbo",
  ],
  rules: {
    // Default offs from turborepo example.
    // Not working for some reason https://github.com/vercel/next.js/discussions/24254
    "@next/next/no-html-link-for-pages": "off",
    // Not explained. Do we really need it?
    // "react/jsx-key": "off",

    // Evolu
    "@typescript-eslint/prefer-readonly-parameter-types": "off",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "functional/no-return-void": "off",
    "react-hooks/exhaustive-deps": "error",
    "no-console": "error",
    "import/no-cycle": "error",
  },
};
