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
  async redirects() {
    return [
      {
        source: "/docs/quickstart",
        destination: "/docs/local-first",
        permanent: true,
      },
      {
        source: "/docs/installation",
        destination: "/docs/local-first",
        permanent: true,
      },
      {
        source: "/docs/evolu-server",
        destination: "/docs/relay",
        permanent: true,
      },
      {
        source: "/docs/evolu-relay",
        destination: "/docs/relay",
        permanent: true,
      },
      {
        source: "/examples/:path*",
        destination: "/docs/examples",
        permanent: true,
      },
    ];
  },
};

export default withSearch(withMDX(nextConfig));
