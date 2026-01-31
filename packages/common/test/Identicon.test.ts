import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import {
  createAppOwner,
  createIdenticon,
  createOwnerSecret,
} from "../src/index.js";
import { testCreateDeps } from "../src/Test.js";

test.skip("generates visually distinct identicons", () => {
  const deps = testCreateDeps();
  const ids = [];
  for (let i = 0; i < 10; i++) {
    const secret = createOwnerSecret(deps);
    const owner = createAppOwner(secret);
    ids.push(owner.id);
  }

  // Generate SVG files for visual inspection
  const outputDir = join(__dirname, "test-identicons");
  mkdirSync(outputDir, { recursive: true });

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const quadrantSvg = createIdenticon(id, "quadrant");
    const sutnarSvg = createIdenticon(id, "sutnar");
    const gradientSvg = createIdenticon(id, "gradient");
    const githubSvg = createIdenticon(id, "github");

    const quadrantFilename = join(
      outputDir,
      `quadrant-${i.toString().padStart(2, "0")}.svg`,
    );
    const sutnarFilename = join(
      outputDir,
      `sutnar-${i.toString().padStart(2, "0")}.svg`,
    );
    const gradientFilename = join(
      outputDir,
      `gradient-${i.toString().padStart(2, "0")}.svg`,
    );
    const githubFilename = join(
      outputDir,
      `github-${i.toString().padStart(2, "0")}.svg`,
    );

    writeFileSync(quadrantFilename, quadrantSvg);
    writeFileSync(sutnarFilename, sutnarSvg);
    writeFileSync(gradientFilename, gradientSvg);
    writeFileSync(githubFilename, githubSvg);
  }
});
