/** @type {import("prettier").Config} */
const prettierConfig = {
  plugins: [
    "prettier-plugin-embed",
    "prettier-plugin-sql-cst",
    "prettier-plugin-jsdoc",
    "prettier-plugin-tailwindcss",
  ],
};

/** @type {import("prettier-plugin-embed").PrettierPluginEmbedOptions} */
const prettierPluginEmbedConfig = {
  embeddedSqlParser: "sqlite",
  embeddedSqlPlugin: "prettier-plugin-sql-cst",
  embeddedSqlTags: ["sql", "sql.prepared", "sql.raw"],
  sqlCanonicalSyntax: false,
  sqlFunctionCase: "lower",
  sqlKeywordCase: "lower",
  sqlLiteralCase: "lower",
  sqlParamTypes: ["$name"],
  sqlTypeCase: "lower",
};

const config = {
  ...prettierConfig,
  ...prettierPluginEmbedConfig,
};

export default config;
