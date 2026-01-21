import { execSync } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";

const examplesDir = path.resolve(import.meta.dirname, "../examples");

type Mode = "development" | "production";

interface PackageJson {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

// Hardcoded catalogs matching pnpm-workspace.yaml
const catalogs = {
  react19: {
    "@types/react": "~19.1.13",
    "@types/react-dom": "~19.1.9",
    react: "19.1.0",
    "react-dom": "19.1.0",
  },
} as const;

// Function to toggle the mode for a single example
const toggleMode = (examplePath: string, mode: Mode): void => {
  const packageJsonPath = path.join(examplePath, "package.json");
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, "utf-8"),
  ) as PackageJson;

  // Toggle @evolu/* dependencies
  for (const dep in packageJson.dependencies) {
    if (dep.startsWith("@evolu/")) {
      if (mode === "production") {
        packageJson.dependencies[dep] = `latest`;
      } else {
        packageJson.dependencies[dep] = `workspace:*`;
      }
    }
  }

  // Toggle catalog references in both dependencies and devDependencies
  const toggleCatalogRefs = (deps: Record<string, string>): void => {
    for (const dep in deps) {
      const value = deps[dep];
      if (mode === "production" && value.startsWith("catalog:")) {
        const catalogName = value.replace("catalog:", "");
        const catalog = catalogs[catalogName as keyof typeof catalogs];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (catalog && dep in catalog) {
          deps[dep] = catalog[dep as keyof typeof catalog];
        }
      } else if (mode === "development") {
        // Find which catalog this dep belongs to
        for (const [catalogName, catalogDeps] of Object.entries(catalogs)) {
          if (
            dep in catalogDeps &&
            catalogDeps[dep as keyof typeof catalogDeps] === value
          ) {
            deps[dep] = `catalog:${catalogName}`;
            break;
          }
        }
      }
    }
  };

  toggleCatalogRefs(packageJson.dependencies);
  toggleCatalogRefs(packageJson.devDependencies);

  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
};

// Function to toggle the mode for all examples
const toggleAllExamples = (targetMode: Mode): void => {
  const examples = fs
    .readdirSync(examplesDir)
    .filter((dir) => fs.statSync(path.join(examplesDir, dir)).isDirectory());

  examples.forEach((example) => {
    const examplePath = path.join(examplesDir, example);
    toggleMode(examplePath, targetMode);
  });

  execSync("pnpm clean", { stdio: "inherit" });
  execSync("pnpm i", { stdio: "inherit" });
  // eslint-disable-next-line no-console
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const answer = (await prompt()).trim();
    const mode = parseModeString(answer);
    if (mode) {
      rl.close();
      return mode;
    }
    // eslint-disable-next-line no-console
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
  // eslint-disable-next-line no-console
  console.error("Error:", error);
});
