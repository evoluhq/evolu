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
  embeddedSqlTags: ["sql", "sql.prepared"],
  embeddedSqlPlugin: "prettier-plugin-sql-cst",
  embeddedSqlParser: "sqlite",
  sqlKeywordCase: "lower",
  sqlParamTypes: ["$name"],
  sqlCanonicalSyntax: false,
  sqlLiteralCase: "lower",
};

const config = {
  ...prettierConfig,
  ...prettierPluginEmbedConfig,
};

export default config;
