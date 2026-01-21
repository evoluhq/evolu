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
  pageExtensions: ["js", "jsx", "ts", "tsx", "mdx"],
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
