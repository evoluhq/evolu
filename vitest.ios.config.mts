import { createRequire } from "node:module";
import type { PluginOption } from "vite";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const { nativePlugin } = require("vitest-mobile") as {
  readonly nativePlugin: (options?: {
    readonly platform?: "ios";
    readonly metro?: {
      readonly babelPlugins?: ReadonlyArray<string>;
      readonly customize?: MetroConfigCustomizer;
    };
  }) => PluginOption;
};

interface MetroResolution {
  readonly type: string;
  readonly filePath?: string;
}

interface MetroResolverContext {
  readonly resolveRequest: MetroResolveRequest;
}

type MetroResolveRequest = (
  context: MetroResolverContext,
  moduleName: string,
  platform: string | null,
) => MetroResolution;

interface MetroConfig {
  readonly resolver?: {
    readonly resolveRequest?: MetroResolveRequest;
  };
}

type MetroConfigCustomizer = (config: MetroConfig) => MetroConfig;

const customizeMetro: MetroConfigCustomizer = (config) => {
  const defaultResolveRequest = config.resolver?.resolveRequest;
  const resolveRequest: MetroResolveRequest = (
    context,
    moduleName,
    platform,
  ) => {
    const resolve = (moduleName: string) =>
      defaultResolveRequest == null
        ? context.resolveRequest(context, moduleName, platform)
        : defaultResolveRequest(context, moduleName, platform);

    try {
      return resolve(moduleName);
    } catch (error) {
      if (!moduleName.startsWith(".") || !moduleName.endsWith(".js"))
        throw error;

      const moduleNameWithoutJs = moduleName.slice(0, -".js".length);
      for (const extension of [".ts", ".tsx"] as const) {
        try {
          return resolve(`${moduleNameWithoutJs}${extension}`);
        } catch {
          // Try the next TypeScript source extension.
        }
      }

      throw error;
    }
  };

  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest,
    },
  };
};

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          nativePlugin({
            platform: "ios",
            metro: {
              babelPlugins: [
                "@babel/plugin-transform-explicit-resource-management",
              ],
              customize: customizeMetro,
            },
          }),
        ],
        test: {
          name: "ios",
          // Required for vitest-mobile: without it, Vitest splits files into
          // separate native worker tasks and the iOS run tears down early.
          isolate: false,
          // vitest-mobile runs setupFiles on the device through its test
          // registry. Include the setup file so Metro bundles it, exclude it so
          // Vitest does not run it as a suite, and keep setupFiles so it
          // actually executes before source tests.
          include: [
            "packages/react-native/test/_setup.ios.test.ts",
            // Keep this source-test set small and expand it incrementally:
            // vitest-mobile iOS runs are currently slow and flaky, even when the
            // tested code itself is fast.

            "packages/common/test/Array.test.ts",
            "packages/common/test/Assert.test.ts",
            "packages/common/test/BigInt.test.ts",
            "packages/common/test/Brand.test.ts",
            "packages/common/test/Cache.test.ts",
            "packages/common/test/Callbacks.test.ts",

            // Uses inline snapshots, which vitest-mobile does not support yet.
            // "packages/common/test/Buffer.test.ts",

            // Task2.test.ts imports Vitest's vi and assert for other
            // coverage. vitest-mobile's runtime shim does not provide those
            // APIs, and a correct mobile implementation needs more than a
            // simple re-export.
            // "packages/common/test/Task2.test.ts",
          ],
          exclude: ["packages/react-native/test/_setup.ios.test.ts"],
          setupFiles: ["packages/react-native/test/_setup.ios.test.ts"],
        },
      },
    ],
  },
});
