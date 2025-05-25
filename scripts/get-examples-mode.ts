import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const EXAMPLES_DIR = path.resolve(__dirname, "../examples");
const examples = readdirSync(EXAMPLES_DIR).filter((dir) =>
  statSync(path.join(EXAMPLES_DIR, dir)).isDirectory(),
);

let isDev = false;
for (const ex of examples) {
  const pkgPath = path.join(EXAMPLES_DIR, ex, "package.json");
  const deps = JSON.parse(readFileSync(pkgPath, "utf8")).dependencies || {};
  const evolves = Object.keys(deps).filter((d) => d.startsWith("@evolu/"));
  if (evolves.some((d) => deps[d].includes("workspace"))) {
    isDev = true;
    break;
  }
}

console.log(isDev ? "development" : "production");
