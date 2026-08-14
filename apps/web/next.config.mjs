import { env } from "node:process";
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
  transpilePackages: [
    "@evolu/common",
    "@evolu/react",
    "@evolu/react-web",
    "@evolu/web",
  ],
  webpack: (config) => {
    if (env.VERCEL) config.cache = false;

    // Source files refer to workers by their emitted .js names.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },

  outputFileTracingIncludes: {
    "/api/docs-md/*": ["./src/app/(docs)/docs/**/*.mdx"],
    "/llms-full.txt": ["./src/app/**/*.mdx"],
    "/llms.txt": ["./src/app/**/*.mdx"],
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
