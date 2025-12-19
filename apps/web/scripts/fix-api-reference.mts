/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const reference = path.join(
  import.meta.dirname,
  "..",
  "src/app/(docs)/docs/api-reference",
);

function rearrangeMdxFilesRecursively(dir: string) {
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
        fixLinksInMdxFile(
          path.join(newFolder, "page.mdx"),
          `${baseName} - API reference`,
        );
      } else {
        const title =
          dir === reference
            ? "API reference"
            : `${path.basename(dir)} - API reference`;
        fixLinksInMdxFile(fullPath, title);
      }
    }
  }
}

function fixLinksInMdxFile(filePath: string, title: string) {
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

  // Extract ## headings to generate sections for "On this page" navigation
  const sections = extractSections(newContent);
  const sectionsExport =
    sections.length > 0
      ? `export const sections = ${JSON.stringify(sections)};`
      : "export const sections = [];";

  // add meta tags (idempotent)
  newContent = newContent.replace(
    /^export const metadata = \{ title: [^}]*\};\s*\r?\n\s*/,
    "",
  );
  newContent = newContent.replace(
    /^export const sections = .*;\s*\r?\n\s*/m,
    "",
  );
  newContent = `export const metadata = { title: '${title}' };
${sectionsExport}
	
${newContent}`;

  fs.writeFileSync(filePath, newContent);
}

/** Extract ## headings from MDX content to generate sections */
function extractSections(
  content: string,
): Array<{ id: string; title: string }> {
  const sections: Array<{ id: string; title: string }> = [];
  // Match ## headings (not ### or deeper)
  const headingRegex = /^## (.+)$/gm;
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const title = match[1].trim();
    // Generate id from title (kebab-case)
    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    if (id) {
      sections.push({ id, title });
    }
  }
  return sections;
}

// Run the script
rearrangeMdxFilesRecursively(reference);

console.log("--------------------------------------");
console.log("API reference rearranged successfully.");
console.log("--------------------------------------");
