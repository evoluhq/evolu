import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@evolu/common",
    "@evolu/react",
    "@evolu/react-web",
    "@evolu/sqlite-wasm",
    "@evolu/web",
  ],
  turbopack: {
    resolveAlias: {
      "Db.worker.js": "../../packages/web/src/local-first/Db.worker.ts",
      "Shared.worker.js": "../../packages/web/src/local-first/Shared.worker.ts",
    },
  },
};

export default nextConfig;
