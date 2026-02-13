import nextMDX from "@next/mdx";

import { recmaPlugins } from "./src/mdx/recma.mjs";
import { rehypePlugins } from "./src/mdx/rehype.mjs";
import { remarkPlugins } from "./src/mdx/remark.mjs";
import withSearch from "./src/mdx/search.mjs";

const withMDX = nextMDX({
  options: {
    remarkPlugins,
    rehypePlugins,
    recmaPlugins,
  },
});

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ["js", "jsx", "ts", "tsx", "mdx"],

  // Resolve workspace @evolu/* packages to TypeScript source for live reload.
  // The "source" condition matches the export added to each package.json.
  // The extensionAlias maps .js imports to .ts since packages use NodeNext
  // module resolution with explicit .js extensions (required for npm publishing).
  transpilePackages: [
    "@evolu/common",
    "@evolu/web",
    "@evolu/react",
    "@evolu/react-web",
  ],
  webpack(config) {
    config.resolve.conditionNames = [
      "source",
      "browser",
      "import",
      "module",
      "require",
      "default",
    ];
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },

  outputFileTracingIncludes: {
    "/**/*": ["./src/app/**/*.mdx"],
  },
  async rewrites() {
    return [
      {
        // Rewrite /docs/index.md to the root docs page
        source: "/docs/index.md",
        destination: "/api/docs-md/index",
      },
      {
        // Rewrite /docs/*.md to the LLM markdown route
        source: "/docs/:path*.md",
        destination: "/api/docs-md/:path*",
      },
    ];
  },
};

export default withSearch(withMDX(nextConfig));
