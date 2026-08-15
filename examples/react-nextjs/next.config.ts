import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
