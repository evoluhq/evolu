/* oxlint-disable eslint/no-console */
import glob from "fast-glob";
import fs from "node:fs";
import path from "node:path";

const defaultReferenceDir = path.join(
  import.meta.dirname,
  "../app/(docs)/docs/api-reference",
);

export interface PublishApiReferenceResult {
  readonly changedMdxPaths: ReadonlyArray<string>;
  readonly deletedMdxPaths: ReadonlyArray<string>;
}

export const fixApiReference = (referenceDir: string): void => {
  rearrangeMdxFilesRecursively(referenceDir, referenceDir);
};

export const publishApiReference = (
  sourceDir: string,
  targetDir: string,
): PublishApiReferenceResult => {
  const sourceMdxPaths = glob.sync("**/*.mdx", { cwd: sourceDir }).toSorted();
  const targetMdxPaths = glob.sync("**/*.mdx", { cwd: targetDir }).toSorted();
  const sourceMdxPathSet = new Set(sourceMdxPaths);
  const changedMdxPaths: Array<string> = [];
  const deletedMdxPaths: Array<string> = [];

  for (const mdxPath of sourceMdxPaths) {
    const sourcePath = path.join(sourceDir, mdxPath);
    const targetPath = path.join(targetDir, mdxPath);
    const content = fs.readFileSync(sourcePath);

    if (
      fs.existsSync(targetPath) &&
      content.equals(fs.readFileSync(targetPath))
    ) {
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const temporaryPath = `${targetPath}.tmp`;
    fs.writeFileSync(temporaryPath, content);
    fs.renameSync(temporaryPath, targetPath);
    changedMdxPaths.push(mdxPath);
  }

  for (const mdxPath of targetMdxPaths) {
    if (sourceMdxPathSet.has(mdxPath)) continue;

    fs.rmSync(path.join(targetDir, mdxPath));
    deletedMdxPaths.push(mdxPath);
  }

  return { changedMdxPaths, deletedMdxPaths };
};

const rearrangeMdxFilesRecursively = (
  dir: string,
  referenceDir: string,
): void => {
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      rearrangeMdxFilesRecursively(fullPath, referenceDir);
    } else if (item.endsWith(".mdx")) {
      if (item !== "page.mdx") {
        const baseName = path.basename(item, ".mdx");
        const newFolder = path.join(dir, baseName);
        fs.mkdirSync(newFolder, { recursive: true });
        const newPath = path.join(newFolder, "page.mdx");
        fs.renameSync(fullPath, newPath);
        fixMdxFile(newPath, `${baseName} - API reference`, referenceDir);
      } else {
        const title =
          dir === referenceDir
            ? "API reference"
            : `${path.basename(dir)} - API reference`;
        fixMdxFile(fullPath, title, referenceDir);
      }
    }
  }
};

const fixMdxFile = (
  filePath: string,
  title: string,
  referenceDir: string,
): void => {
  const content = fs.readFileSync(filePath, "utf8");
  let newContent = content.replaceAll("/page.mdx", "");
  newContent = newContent.replaceAll(/\]\(([^)]*?)\.mdx(?=[)#?])/gu, "]($1");
  newContent = newContent.replace(
    /^(\[API Reference\]\([^)]*\))(.*)/mu,
    (_match, _apiLink, rest: string) => {
      const fixedRest = rest.replaceAll(" / ", " › ");
      return `[API reference](/docs/api-reference)${fixedRest}`;
    },
  );
  newContent = newContent
    .replaceAll("[local-first/", "[local‑first/")
    .replaceAll(" › local-first/", " › local‑first/");

  const lines = newContent.split("\n");
  const result: Array<string> = [];
  let skipUntilLevel = 0;
  let lastSkippedLine = "";

  for (const line of lines) {
    const headingMatch = /^(#{2,6}) /u.exec(line);
    const level = headingMatch ? headingMatch[1].length : 0;
    // TypeDoc emits a member's anchor before its heading, so it ends the
    // previous member's skipped section, as does a heading at the same or a
    // higher level.
    if (
      skipUntilLevel > 0 &&
      (/^<a id="[^"]+"><\/a>$/u.test(line) ||
        (level > 0 && level <= skipUntilLevel))
    ) {
      skipUntilLevel = 0;
      // The rule the theme puts between members ends a skipped section that
      // closes a member, so keep it. A union return type puts rules between
      // its members, but never after the last one.
      if (lastSkippedLine === "---") result.push("---", "");
    }
    // parametersFormat "none" in typedoc.json omits Parameters and Type
    // Parameters sections, but the Markdown theme has no option to omit
    // Returns sections. A returned function's signature nests its own Returns
    // section, which the outer one skips with the rest of its content.
    if (skipUntilLevel === 0 && /^#{2,6} Returns?$/u.test(line)) {
      skipUntilLevel = level;
      lastSkippedLine = "";
      continue;
    }
    if (skipUntilLevel === 0) result.push(line);
    else if (line.trim() !== "") lastSkippedLine = line;
  }
  newContent = result.join("\n");

  if (filePath === path.join(referenceDir, "page.mdx")) {
    newContent = newContent
      .replace(/^## Modules\b/mu, "## Packages")
      .replaceAll(/\bModule\b/gu, "Package");
  }

  newContent = newContent
    .replace(/^export const metadata = \{ title: [^}]*\};\s*\r?\n\s*/u, "")
    .replace(/^export const sections = .*;\s*\r?\n\s*/mu, "");
  newContent = `export const metadata = { title: '${title}' };
\t
${newContent}`;

  fs.writeFileSync(filePath, newContent);
};

/* node:coverage ignore next 4 */
if (import.meta.main) {
  fixApiReference(defaultReferenceDir);
  console.log("API reference rearranged successfully.");
}
