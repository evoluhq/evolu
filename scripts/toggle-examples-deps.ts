import inquirer from "inquirer";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const examplesDir = path.resolve(__dirname, "../examples");

type Mode = "development" | "production";

// Hardcoded catalogs matching pnpm-workspace.yaml
const CATALOGS = {
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
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  // Toggle @evolu/* dependencies
  for (const dep in packageJson.dependencies) {
    if (dep.startsWith("@evolu/")) {
      if (mode === "production") {
        packageJson.dependencies[dep] = `latest`;
      } else if (mode === "development") {
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
        const catalog = CATALOGS[catalogName as keyof typeof CATALOGS];
        if (catalog && dep in catalog) {
          deps[dep] = catalog[dep as keyof typeof catalog];
        }
      } else if (mode === "development") {
        // Find which catalog this dep belongs to
        for (const [catalogName, catalogDeps] of Object.entries(CATALOGS)) {
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

  if (packageJson.dependencies) {
    toggleCatalogRefs(packageJson.dependencies);
  }
  if (packageJson.devDependencies) {
    toggleCatalogRefs(packageJson.devDependencies);
  }

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
  console.log(`All examples switched to ${targetMode} mode.`);
};

// Ask the user for the mode interactively using inquirer
const askForMode = async (): Promise<Mode> => {
  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "Which mode do you want to switch to?",
      choices: ["development", "production"],
    },
  ]);

  return mode as Mode;
};

const main = async () => {
  const mode = await askForMode();
  toggleAllExamples(mode);
};

// Run the main function
main().catch((error) => {
  console.error("Error:", error);
});
