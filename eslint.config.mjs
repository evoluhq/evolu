import eslint from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/*.js",
      "**/*.mjs",
      "**/.next/",
      "**/.turbo/",
      "**/dist/",
      "**/.svelte-kit/",
    ],
  },
  {
    files: [
      "apps/**/*.{ts,tsx}",
      "packages/**/*.{ts,tsx}",
      // "examples/**/*.{ts,tsx}", // Uncomment to lint examples.
    ],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      jsdoc.configs["flat/recommended"],
      importPlugin.flatConfigs.warnings,
      // importPlugin.flatConfigs.typescript,
      // We had to disable node_modules and .js extensions otherwise Eslint reads
      // from node_modules and crashes.
      // https://github.com/import-js/eslint-plugin-import/blob/main/config/typescript.js
      {
        settings: {
          "import/extensions": [".ts", ".tsx"],
          // "import/external-module-folders": [
          //   "node_modules",
          //   "node_modules/@types",
          // ],
          "import/parsers": {
            "@typescript-eslint/parser": [".ts", ".tsx"],
          },
          "import/resolver": {
            node: {
              extensions: [".ts", ".tsx"],
            },
          },
        },
        rules: {
          "import/named": "off",
        },
      },
    ],
    plugins: {
      "react-hooks": reactHooksPlugin,
      jsdoc,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      "@typescript-eslint/array-type": ["error", { default: "generic" }],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
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
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "error",
      "@typescript-eslint/restrict-template-expressions": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
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
      "jsdoc/check-tag-names": ["error", { definedTags: ["category"] }],
      "import/no-cycle": "error",
    },
  },
);
