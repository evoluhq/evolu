// @ts-check
const withTM = require("next-transpile-modules")(["evolu"]);
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    esmExternals: "loose",
  },
};

module.exports = withBundleAnalyzer(withTM(nextConfig));
