import inquirer from "inquirer";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const examplesDir = path.resolve(__dirname, "../examples");

type Mode = "Development" | "Production";

// Function to toggle the mode for a single example
const toggleMode = (examplePath: string, mode: Mode): void => {
  const packageJsonPath = path.join(examplePath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  for (const dep in packageJson.dependencies) {
    if (!dep.startsWith("@evolu/")) {
      continue;
    }

    if (mode === "Production") {
      packageJson.dependencies[dep] = `npm:${dep}@latest`;
    } else if (mode === "Development") {
      packageJson.dependencies[dep] = `workspace:*`;
    }
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
      choices: ["Development", "Production"],
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
