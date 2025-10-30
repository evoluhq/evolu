import fs from "fs";

/**
 * Cleans MDX content by removing imports, exports, JSX components, and
 * converting relative links.
 */
export function cleanMdxContent(content: string): string {
  // Remove import statements - ensuring we catch all top-level imports
  let cleanedContent = content.replace(/^import\s+.*?['"].*?['"];?\s*$/gm, "");

  // Remove export statements including metadata objects
  cleanedContent = cleanedContent.replace(
    /export\s+const\s+metadata\s*=\s*\{[\s\S]*?\};\s*/g,
    "",
  );

  // Remove JSX component tags
  cleanedContent = cleanedContent.replace(/<[A-Z][a-zA-Z]*.*?\/>/g, "");
  cleanedContent = cleanedContent.replace(
    /<[A-Z][a-zA-Z]*.*?>.*?<\/[A-Z][a-zA-Z]*>/g,
    "",
  );

  // Remove CodeGroup tags but keep their content
  cleanedContent = cleanedContent.replace(/<CodeGroup.*?>/g, "");
  cleanedContent = cleanedContent.replace(/<\/CodeGroup>/g, "");

  // Convert relative links to absolute links with predefined prefix
  const baseUrl = "https://evolu.dev/";
  cleanedContent = cleanedContent.replace(
    /\[([^\]]+)\]\((?!https?:\/\/)([^)]+)\)/g,
    (match: string, text: string, url: string) => {
      // Skip conversion for anchor links that start with #
      if (url.startsWith("#")) {
        return match;
      }
      // Remove leading slash if present
      const cleanUrl = url.startsWith("/") ? url.substring(1) : url;
      return `[${text}](${baseUrl}${cleanUrl})`;
    },
  );

  return cleanedContent.trim();
}

export interface MDXModule {
  metadata?: {
    title?: string;
    description?: string;
  };
  title?: string;
  sections?: Array<{ title: string; id: string }>;
}

export const customOrder: Record<string, number> = {
  quickstart: 1,
  patterns: 2,
  indexes: 3,
  migrations: 4,
  "time-travel": 5,
  "api-reference": 100,
};

export const excludePaths = [
  "api-reference",
  "showcase",
  "examples",
  "comparison",
  "conventions",
  "dependency-injection",
  "evolu-relay",
  "faq",
  // Add other paths to exclude as needed
];

/** Loads and processes MDX content from a file path */
export async function loadMdxContent(
  fullPath: string,
  relativePath: string,
): Promise<{
  path: string;
  title: string;
  sections: Array<{ title: string; id: string }>;
  content: string;
}> {
  try {
    const path = `/(docs)/docs/${relativePath.replace(/page\.mdx$/, "")}`;

    // Read the raw MDX file content
    const rawContent = fs.readFileSync(fullPath, "utf8");
    const cleanedContent = cleanMdxContent(rawContent);

    // Get metadata via dynamic import
    const module = (await import(
      `../app/(docs)/docs/${relativePath}`
    )) as MDXModule;

    // Get title from metadata object or fallback to direct title property or path
    const title =
      module.metadata?.title ??
      module.title ??
      path.split("/").pop() ??
      "Untitled";

    return {
      path,
      title,
      sections: module.sections ?? [],
      content: cleanedContent,
    };
  } catch (error) {
    // Log error but continue processing other files
    // eslint-disable-next-line no-console
    console.error(`Error loading ${relativePath}:`, error);
    return {
      path: `/(docs)/docs/${relativePath.replace(/page\.mdx$/, "")}`,
      title: relativePath.split("/").pop() ?? "Error",
      sections: [],
      content: "",
    };
  }
}

/** Fetches and processes all MDX files for LLM documentation */
export async function fetchProcessedMdxPages(
  includeApiReference = false,
): Promise<
  Array<{
    path: string;
    title: string;
    sections: Array<{ title: string; id: string }>;
    content: string;
  }>
> {
  const glob = await import("fast-glob");

  // Find all MDX files, conditionally excluding specified paths
  const ignoreList = includeApiReference
    ? excludePaths.filter((path) => path !== "api-reference")
    : excludePaths;

  const mdxFiles = await glob.default("**/*.mdx", {
    cwd: "src/app/(docs)/docs",
    ignore: ignoreList,
  });

  // Sort files based on custom order
  const sortedFiles = mdxFiles.sort((a, b) => {
    const folderA = a.split("/")[0];
    const folderB = b.split("/")[0];

    const orderA = customOrder[folderA] || Number.MAX_SAFE_INTEGER;
    const orderB = customOrder[folderB] || Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // Fallback to alphabetical order
    return folderA.localeCompare(folderB);
  });

  // Load the MDX content and metadata
  return Promise.all(
    sortedFiles.map(async (filename) => {
      const fullPath = `${process.cwd()}/src/app/(docs)/docs/${filename}`;
      return loadMdxContent(fullPath, filename);
    }),
  );
}
