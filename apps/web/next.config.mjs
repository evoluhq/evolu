import path from "node:path";
import nextMDX from "@next/mdx";

const withMDX = nextMDX({
  options: {
    remarkPlugins: [path.join(import.meta.dirname, "src/mdx/remark.mjs")],
    rehypePlugins: [path.join(import.meta.dirname, "src/mdx/rehype.mjs")],
    recmaPlugins: [path.join(import.meta.dirname, "src/mdx/recma.mjs")],
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
  experimental: {
    // @typescript/typescript6 exposes the compiler API and tsc6, not tsc.
    useTypeScriptCli: false,
  },
  turbopack: {
    resolveAlias: {
      "Db.worker.js": "../../packages/web/src/local-first/Db.worker.ts",
      "Shared.worker.js": "../../packages/web/src/local-first/Shared.worker.ts",
    },
  },
  outputFileTracingIncludes: {
    "/api/docs-md/*": ["./src/app/(docs)/docs/**/*.mdx"],
    "/llms-full.txt": ["./src/app/**/*.mdx"],
    "/llms.txt": ["./src/app/**/*.mdx"],
  },

  rewrites() {
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

export default withMDX(nextConfig);
