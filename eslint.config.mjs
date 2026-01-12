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
      "**/out/",
      "**/*.d.ts",
      // To validate examples, uncomment apps/** and packages/** otherwise
      // FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
      "examples/**",
      // "apps/**",
      // "packages/**",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
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
      // https://github.com/typescript-eslint/typescript-eslint/issues/8113#issuecomment-2334943836
      "@typescript-eslint/no-invalid-void-type": "off",

      // It seems its buggy, disable it for now.
      "@typescript-eslint/no-redundant-type-constituents": "off",

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
  {
    // https://github.com/vitest-dev/vitest/issues/4543#issuecomment-1824881253
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: ["packages/vue/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    files: ["apps/web/typography.mts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
);
