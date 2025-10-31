// @ts-check

import eslint from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/.next/",
      "**/.svelte-kit/",
      "**/.turbo/",
      "**/dist/",
      "**/*.d.ts",
      // TODO: Consider enabling linting for scripts and examples later.
      "scripts/**",
      // To validate examples, uncomment apps/** and packages/** otherwise
      // FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
      "examples/**",
      // "apps/**",
      // "packages/**",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      jsdoc.configs["flat/recommended"],
      reactHooksPlugin.configs.flat.recommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-console": "error",
      "@typescript-eslint/array-type": ["error", { default: "generic" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
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
      "jsdoc/check-tag-names": [
        "error",
        { definedTags: ["category", "experimental"] },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
