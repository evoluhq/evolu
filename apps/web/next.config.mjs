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

const isDev = globalThis.process?.env.NODE_ENV === "development";

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ["js", "jsx", "ts", "tsx", "mdx"],

  // Resolve workspace @evolu/* packages to TypeScript source for live reload.
  transpilePackages: isDev
    ? ["@evolu/common", "@evolu/web", "@evolu/react", "@evolu/react-web"]
    : [],
  webpack(config) {
    if (isDev) {
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
    }
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
