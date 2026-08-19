/* eslint-disable no-console */
import { compile } from "@mdx-js/mdx";
import { assertNonNullable } from "@evolu/common";
import glob from "fast-glob";
import fs from "node:fs";
import path from "node:path";

import { rehypePlugins } from "../src/mdx/rehype.mjs";
import { remarkPlugins } from "../src/mdx/remark.mjs";

const defaultReferenceDir = path.join(
  import.meta.dirname,
  "../src/app/(docs)/docs/api-reference",
);
const defaultDocsDir = path.join(import.meta.dirname, "../src/app/(docs)");
const defaultSectionsPath = path.join(
  import.meta.dirname,
  "../src/data/sections.json",
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
  const sourceMdxPaths = glob.sync("**/*.mdx", { cwd: sourceDir }).sort();
  const targetMdxPaths = glob.sync("**/*.mdx", { cwd: targetDir }).sort();
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

export const generateSections = async ({
  docsDir,
  mdxPaths,
  outputPath,
}: {
  readonly docsDir: string;
  readonly mdxPaths?: ReadonlyArray<string>;
  readonly outputPath: string;
}): Promise<boolean> => {
  const isPartial = mdxPaths !== undefined && fs.existsSync(outputPath);
  const pages = (
    isPartial
      ? [...new Set(mdxPaths)]
      : await glob("**/*.mdx", { cwd: docsDir })
  ).sort();
  const sectionsByRoute = isPartial
    ? (JSON.parse(fs.readFileSync(outputPath, "utf8")) as Record<
        string,
        Array<{ title: string; id: string }>
      >)
    : {};

  for (const filename of pages) {
    const route = `/${filename.replace(/(^|\/)page\.mdx$/, "")}`;
    const filePath = path.join(docsDir, filename);

    if (!fs.existsSync(filePath)) {
      Reflect.deleteProperty(sectionsByRoute, route);
      continue;
    }

    const compiled = await compile(fs.readFileSync(filePath, "utf8"), {
      remarkPlugins,
      rehypePlugins,
    });
    const match = /export const sections = (\[[\s\S]*?\]);/.exec(
      String(compiled.value),
    );
    assertNonNullable(match);

    sectionsByRoute[route] = eval(match[1]) as Array<{
      title: string;
      id: string;
    }>;
  }

  const output = JSON.stringify(sectionsByRoute, null, 2);
  if (
    fs.existsSync(outputPath) &&
    fs.readFileSync(outputPath, "utf8") === output
  )
    return false;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);

  return true;
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
  let newContent = content.replace(/\/page\.mdx/g, "");
  newContent = newContent.replace(/\]\(([^)]*?)\.mdx(?=[)#?])/g, "]($1");
  newContent = newContent.replace(
    /^(\[API Reference\]\([^)]*\))(.*)/m,
    (_match, _apiLink, rest: string) => {
      const fixedRest = rest.replace(/ \/ /g, " › ");
      return `[API reference](/docs/api-reference)${fixedRest}`;
    },
  );
  newContent = newContent
    .replace(/\[local-first\//g, "[local‑first/")
    .replace(/ › local-first\//g, " › local‑first/");

  const lines = newContent.split("\n");
  const result: Array<string> = [];
  let skipUntilLevel = 0;

  for (const line of lines) {
    const headingMatch = /^(#{2,4}) /.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      if (/^#{2,4} (?:Type Parameters?|Parameters?|Returns?)$/.test(line)) {
        skipUntilLevel = level;
        continue;
      }
      if (skipUntilLevel > 0 && level <= skipUntilLevel) {
        skipUntilLevel = 0;
      }
    }
    if (skipUntilLevel === 0) result.push(line);
  }
  newContent = result.join("\n");

  if (filePath === path.join(referenceDir, "page.mdx")) {
    newContent = newContent
      .replace(/^## Modules\b/m, "## Packages")
      .replace(/\bModule\b/g, "Package");
  }

  newContent = newContent
    .replace(/^export const metadata = \{ title: [^}]*\};\s*\r?\n\s*/, "")
    .replace(/^export const sections = .*;\s*\r?\n\s*/m, "");
  newContent = `export const metadata = { title: '${title}' };
\t
${newContent}`;

  fs.writeFileSync(filePath, newContent);
};

/* node:coverage ignore next 12 */
if (import.meta.main) {
  fixApiReference(defaultReferenceDir);
  console.log("API reference rearranged successfully.");
  console.log(
    (await generateSections({
      docsDir: defaultDocsDir,
      outputPath: defaultSectionsPath,
    }))
      ? "Documentation sections generated."
      : "Documentation sections are up to date.",
  );
}
