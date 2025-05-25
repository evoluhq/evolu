import { execSync } from "child_process";
import { readdirSync } from "fs";
import { join } from "path";

const PACKAGES_DIR = "packages";
const EXCLUDED_PACKAGES = ["tsconfig"];

interface PackageInfo {
  name: string;
  version: string;
}

function getPackageInfo(packagePath: string): PackageInfo {
  const packageJson = require(join(process.cwd(), packagePath, "package.json"));
  return {
    name: packageJson.name,
    version: packageJson.version,
  };
}

function runCommand(command: string) {
  console.log(`Running: ${command}`);
  execSync(command, { stdio: "inherit" });
}

async function main() {
  try {
    // Build all packages
    console.log("Building all packages...");
    runCommand("pnpm build");

    // Get all package directories
    const packageDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .filter((dirent) => !EXCLUDED_PACKAGES.includes(dirent.name))
      .map((dirent) => join(PACKAGES_DIR, dirent.name));

    // Publish each package
    for (const packageDir of packageDirs) {
      const { name } = getPackageInfo(packageDir);
      console.log(`\nPublishing ${name}...`);
      runCommand(`cd ${packageDir} && pnpm dlx packlink publish`);
    }

    console.log("\n✅ All packages published locally!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
