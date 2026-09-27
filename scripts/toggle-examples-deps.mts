import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const repoDir = path.resolve(import.meta.dirname, "..");
const examplesDir = path.join(repoDir, "examples");

type Mode = "development" | "production";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

type Catalogs = Readonly<Record<string, Readonly<Record<string, string>>>>;

// Function to toggle the mode for a single example
const toggleMode = (
  examplePath: string,
  mode: Mode,
  catalogs: Catalogs,
): void => {
  const packageJsonPath = path.join(examplePath, "package.json");
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, "utf-8"),
  ) as PackageJson;

  const toggleEvoluDeps = (deps?: Record<string, string>): void => {
    if (!deps) {
      return;
    }

    for (const dep in deps) {
      if (dep.startsWith("@evolu/")) {
        if (mode === "production") {
          deps[dep] = `latest`;
        } else {
          deps[dep] = `workspace:*`;
        }
      }
    }
  };

  // Toggle @evolu/* dependencies in both sections because some examples keep
  // local Evolu packages in devDependencies.
  toggleEvoluDeps(packageJson.dependencies);
  toggleEvoluDeps(packageJson.devDependencies);

  // A version alone cannot tell a catalog version from a pinned one, such as
  // the Expo example's exact react, so development mode restores the catalog
  // references of the committed package.json.
  let committedPackageJson: PackageJson | null = null;
  if (mode === "development") {
    try {
      committedPackageJson = JSON.parse(
        execFileSync(
          "git",
          ["show", `HEAD:${path.relative(repoDir, packageJsonPath)}`],
          {
            cwd: repoDir,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
          },
        ),
      ) as PackageJson;
    } catch {
      // An example that is not committed yet has no references to restore.
    }
  }

  // Toggle catalog references in both dependencies and devDependencies
  const toggleCatalogRefs = (
    deps: Record<string, string> | undefined,
    committedDeps: Record<string, string> | undefined,
  ): void => {
    if (!deps) {
      return;
    }

    for (const [dep, value] of Object.entries(deps)) {
      if (mode === "production") {
        if (!value.startsWith("catalog:")) continue;
        const catalogName = value.slice("catalog:".length) || "default";
        const version = catalogs[catalogName]?.[dep];
        if (version === undefined) {
          throw new Error(`Catalog "${catalogName}" has no version of ${dep}.`);
        }
        deps[dep] = version;
      } else {
        const committedValue = committedDeps?.[dep];
        if (committedValue?.startsWith("catalog:")) deps[dep] = committedValue;
      }
    }
  };

  toggleCatalogRefs(
    packageJson.dependencies,
    committedPackageJson?.dependencies,
  );
  toggleCatalogRefs(
    packageJson.devDependencies,
    committedPackageJson?.devDependencies,
  );

  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
};

// Function to toggle the mode for all examples
const toggleAllExamples = (targetMode: Mode): void => {
  // pnpm reads the catalogs from pnpm-workspace.yaml, so they cannot drift.
  const catalogs = JSON.parse(
    execSync("pnpm config get catalogs --json", { encoding: "utf-8" }),
  ) as Catalogs;

  const examples = fs
    .readdirSync(examplesDir)
    .filter((dir) => fs.statSync(path.join(examplesDir, dir)).isDirectory());

  examples.forEach((example) => {
    const examplePath = path.join(examplesDir, example);
    toggleMode(examplePath, targetMode, catalogs);
  });

  execSync("pnpm clean", { stdio: "inherit" });
  execSync("pnpm i", { stdio: "inherit" });
  // oxlint-disable-next-line eslint/no-console
  console.log(`All examples switched to ${targetMode} mode.`);
};

// Parse string into Mode; returns null if invalid
const parseModeString = (arg: string): Mode | null => {
  switch (arg) {
    case "1":
    case "development":
      return "development";
    case "2":
    case "production":
      return "production";
    default:
      return null;
  }
};

// No CLI parsing — script is interactive only

// Ask the user for the mode without inquirer, accepting short answers
const askForModeInteractive = async (): Promise<Mode> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const question =
    "Which mode do you want to switch to? (1) development (2) production: ";
  const prompt = (): Promise<string> =>
    new Promise((resolve) => {
      rl.question(question, resolve);
    });

  // Keep prompting until valid answer
  while (true) {
    const answer = (await prompt()).trim();
    const mode = parseModeString(answer);
    if (mode) {
      rl.close();
      return mode;
    }
    // oxlint-disable-next-line eslint/no-console
    console.log(
      "Invalid option — please reply with 1 or 2 (or 'development'/'production').",
    );
  }
};

const main = async () => {
  const mode = await askForModeInteractive();
  toggleAllExamples(mode);
};

main().catch((error: unknown) => {
  // oxlint-disable-next-line eslint/no-console
  console.error("Error:", error);
});
