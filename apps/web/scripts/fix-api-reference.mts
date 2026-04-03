/* eslint-disable no-console */
import { compile } from "@mdx-js/mdx";
import glob from "fast-glob";
import fs from "node:fs";
import path from "node:path";

import { rehypePlugins } from "../src/mdx/rehype.mjs";
import { remarkPlugins } from "../src/mdx/remark.mjs";

const reference = path.join(
  import.meta.dirname,
  "..",
  "src/app/(docs)/docs/api-reference",
);

const rearrangeMdxFilesRecursively = (dir: string): void => {
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      rearrangeMdxFilesRecursively(fullPath);
    } else if (item.endsWith(".mdx")) {
      if (item !== "page.mdx") {
        const baseName = path.basename(item, ".mdx");
        const newFolder = path.join(dir, baseName);
        fs.mkdirSync(newFolder, { recursive: true });
        fs.renameSync(fullPath, path.join(newFolder, "page.mdx"));
        fixMdxFile(
          path.join(newFolder, "page.mdx"),
          `${baseName} - API reference`,
        );
      } else {
        const title =
          dir === reference
            ? "API reference"
            : `${path.basename(dir)} - API reference`;
        fixMdxFile(fullPath, title);
      }
    }
  }
};

const fixMdxFile = (filePath: string, title: string): void => {
  const content = fs.readFileSync(filePath, "utf-8");
  // first let's replace /page.mdx with /
  let newContent = content.replace(/\/page\.mdx/g, "");
  // Remove .mdx from Markdown link destinations, preserving query/hash.
  // Examples:
  // - [X](/docs/Foo.mdx) -> [X](/docs/Foo)
  // - [X](/docs/Foo.mdx#bar) -> [X](/docs/Foo#bar)
  // - [X](../Foo.mdx?x=1#bar) -> [X](../Foo?x=1#bar)
  newContent = newContent.replace(/\]\(([^)]*?)\.mdx(?=[)#?])/g, "]($1");

  // fix API reference breadcrumb link and separator
  // Breadcrumb is the first line starting with `[API` - replace link text and separators
  newContent = newContent.replace(
    /^(\[API Reference\]\([^)]*\))(.*)/m,
    (_match, _apiLink, rest: string) => {
      const fixedRest = rest.replace(/ \/ /g, " › ");
      return `[API reference](/docs/api-reference)${fixedRest}`;
    },
  );

  // Prevent line breaks in displayed "local-first" labels without changing URLs.
  newContent = newContent
    .replace(/\[local-first\//g, "[local‑first/")
    .replace(/ › local-first\//g, " › local‑first/");

  // Remove redundant sections (heading + content until next heading of same or higher level)
  const lines = newContent.split("\n");
  const result: Array<string> = [];
  let skipUntilLevel = 0; // 0 = not skipping, otherwise skip until heading with <= this many #

  for (const line of lines) {
    const headingMatch = /^(#{2,4}) /.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      if (
        line.startsWith("## Type Parameter") ||
        line.startsWith("## Parameter") ||
        line.startsWith("## Return") ||
        line.startsWith("### Type Parameter") ||
        line.startsWith("### Parameter") ||
        line.startsWith("### Return") ||
        line.startsWith("#### Type Parameter") ||
        line.startsWith("#### Parameter") ||
        line.startsWith("#### Return")
      ) {
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

  if (filePath === path.join(reference, "page.mdx")) {
    newContent = newContent
      .replace(/^## Modules\b/m, "## Packages")
      .replace(/\bModule\b/g, "Package");
  }

  newContent = newContent
    .replace(/^export const metadata = \{ title: [^}]*\};\s*\r?\n\s*/, "")
    .replace(/^export const sections = .*;\s*\r?\n\s*/m, "");

  newContent = `export const metadata = { title: '${title}' };
	
${newContent}`;

  fs.writeFileSync(filePath, newContent);
};

// Run the script
rearrangeMdxFilesRecursively(reference);

console.log("--------------------------------------");
console.log("API reference rearranged successfully.");
console.log("--------------------------------------");

// Generate sections.json
const docsDir = path.join(import.meta.dirname, "..", "src/app/(docs)");
const outputPath = path.join(
  import.meta.dirname,
  "..",
  "src/data/sections.json",
);

const generateSections = async (): Promise<void> => {
  const pages = await glob("**/*.mdx", { cwd: docsDir });
  const allSections: Record<string, Array<{ title: string; id: string }>> = {};

  for (const filename of pages) {
    const filePath = path.join(docsDir, filename);
    const content = fs.readFileSync(filePath, "utf-8");

    const compiled = await compile(content, {
      remarkPlugins,
      rehypePlugins,
    });

    // Extract sections from compiled output
    const match = /export const sections = (\[[\s\S]*?\]);/.exec(
      String(compiled.value),
    );

    const routePath = "/" + filename.replace(/(^|\/)page\.mdx$/, "");

    if (match) {
      const sections = eval(match[1]) as Array<{ title: string; id: string }>;
      allSections[routePath] = sections;
    } else {
      allSections[routePath] = [];
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(allSections, null, 2));

  console.log("--------------------------------------");
  console.log(`Sections generated: ${outputPath}`);
  console.log(`Total pages: ${Object.keys(allSections).length}`);
  console.log("--------------------------------------");
};

await generateSections();
