/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ["effect"],
  },
  async headers() {
    return [
      {
        source: "/(.*?)",
        headers: [
          {
            key: "cross-origin-embedder-policy",
            value: "require-corp",
          },
          {
            key: "cross-origin-opener-policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
