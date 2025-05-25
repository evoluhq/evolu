/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const reference = path.join(
  __dirname,
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
          `${baseName} - API Reference`,
        );
      } else {
        fixLinksInMdxFile(fullPath, "API Reference");
      }
    }
  }
}

function fixLinksInMdxFile(filePath: string, title: string) {
  const content = fs.readFileSync(filePath, "utf-8");
  // first let's replace /page.mdx with /
  let newContent = content.replace(/\/page.mdx/g, "");
  newContent = newContent.replace(/\(([^)]+)\.mdx\)/g, "($1)");

  // fix API Reference breadcrumb link
  newContent = newContent.replace(
    /\[API Reference\]\([^)]*\)/g,
    "[API Reference](/docs/api-reference)",
  );

  // Remove Call Signatures
  newContent = newContent.replace(
    /##\s*Call Signature\r?\n\s*```ts[\s\S]*?```/g,
    "",
  );

  // add meta tags
  newContent = `export const metadata = { title: '${title}' };
export const sections = [];
	
${newContent}`;

  fs.writeFileSync(filePath, newContent);
}

// Run the script
rearrangeMdxFilesRecursively(reference);

console.log("--------------------------------------");
console.log("API Reference rearranged successfully.");
console.log("--------------------------------------");
