module.exports = {
  plugins: ["node"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
    "next/core-web-vitals",
    "turbo",
  ],
  rules: {
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "react-hooks/exhaustive-deps": "error",
    "no-console": "error",
    "import/no-cycle": "error",
  },
};
