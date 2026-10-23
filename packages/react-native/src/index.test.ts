import { assertEqual } from "@evolu/common";
import { build } from "esbuild";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("the main entry imports no optional peer, so bundling createEvoluDeps needs neither Expo nor SVG", async () => {
  const { metafile } = await build({
    entryPoints: [fileURLToPath(new URL("index.ts", import.meta.url))],
    bundle: true,
    packages: "external",
    format: "esm",
    platform: "neutral",
    jsx: "automatic",
    metafile: true,
    write: false,
    logLevel: "silent",
  });

  const imported = Object.values(metafile.outputs)
    .flatMap((output) => output.imports)
    .filter(({ external }) => external)
    .map(({ path }) => path);
  assertEqual(
    imported.filter(
      (path) =>
        path === "expo" ||
        path.startsWith("expo-") ||
        path.startsWith("expo/") ||
        path.startsWith("@expo/") ||
        path.startsWith("react-native-svg"),
    ),
    [],
  );
});
