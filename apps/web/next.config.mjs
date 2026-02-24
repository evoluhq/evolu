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

  ...(globalThis.process?.env.NODE_ENV === "development"
    ? {
        webpack: (config) => {
          // Resolve only @evolu packages to source. Avoid global "source"
          // condition because third-party packages can expose raw TS there.
          config.resolve.alias = {
            ...config.resolve.alias,
            ...Object.fromEntries(
              ["common", "react", "react-web", "web"].map((name) => [
                `@evolu/${name}`,
                new globalThis.URL(
                  `../../packages/${name}/src`,
                  import.meta.url,
                ).pathname,
              ]),
            ),
          };

          // TypeScript source uses .js extensions in imports (ESM standard).
          // Tell webpack to try .ts/.tsx when resolving .js imports.
          config.resolve.extensionAlias = {
            ...config.resolve.extensionAlias,
            ".js": [".ts", ".tsx", ".js"],
          };
          return config;
        },
      }
    : {}),

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
