/** @type {import('next').NextConfig} */
const nextConfig = {
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

  // That's probably the Next.js App Router bug because Pages Router
  // did not require that.
  experimental: { esmExternals: "loose" },
};

module.exports = nextConfig;
