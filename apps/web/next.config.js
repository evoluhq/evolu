// @ts-check

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  reactStrictMode: true,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
  // Those two lines are for Turbo monorepo only.
  transpilePackages: ["evolu"],
  experimental: { esmExternals: "loose" },
};

module.exports = nextConfig;
