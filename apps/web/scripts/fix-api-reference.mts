/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

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
