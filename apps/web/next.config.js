// @ts-check
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  reactStrictMode: true,
  // Monorepo needs.
  transpilePackages: ["evolu"],
  experimental: {
    // Turbo needs, for some reason.
    esmExternals: "loose",
  },
};

module.exports = withBundleAnalyzer(nextConfig);
