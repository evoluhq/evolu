import fs from "fs";
import { navigation } from "./navigation";

/**
 * Cleans MDX content by removing imports, exports, JSX components, and
 * converting relative links.
 */
export function cleanMdxContent(content: string): string {
  // Remove import statements - ensuring we catch all top-level imports
  let cleanedContent = content.replace(/^import\s+.*?['"].*?['"];?\s*$/gm, "");

  // Remove export statements including metadata objects and sections arrays
  cleanedContent = cleanedContent.replace(
    /export\s+const\s+metadata\s*=\s*\{[\s\S]*?\};\s*/g,
    "",
  );
  cleanedContent = cleanedContent.replace(
    /export\s+const\s+sections\s*=\s*\[[\s\S]*?\];\s*/g,
    "",
  );

  // Convert <Heading level={2} id="...">Title</Heading> to ## Title
  cleanedContent = cleanedContent.replace(
    /<Heading\s+level=\{(\d)\}\s+id="[^"]*">\s*([\s\S]*?)\s*<\/Heading>/g,
    (_match: string, level: string, title: string) => {
      const hashes = "#".repeat(Number(level));
      return `${hashes} ${title.trim()}`;
    },
  );

  // Convert <Note>content</Note> to blockquote
  cleanedContent = cleanedContent.replace(
    /<Note>\s*([\s\S]*?)\s*<\/Note>/g,
    (_match: string, noteContent: string) => {
      const lines = noteContent.trim().split("\n");
      return lines.map((line) => `> ${line.trim()}`).join("\n");
    },
  );

  // Remove self-closing JSX component tags
  cleanedContent = cleanedContent.replace(/<[A-Z][a-zA-Z]*[^>]*\/>/g, "");

  // Remove other JSX component tags with content (generic fallback)
  cleanedContent = cleanedContent.replace(
    /<[A-Z][a-zA-Z]*[^>]*>[\s\S]*?<\/[A-Z][a-zA-Z]*>/g,
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

  // Clean up multiple consecutive blank lines
  cleanedContent = cleanedContent.replace(/\n{3,}/g, "\n\n");

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
  // Root overview
  "page.mdx": 1,
  // Library section
  library: 10,
  "dependency-injection": 11,
  "resource-management": 12,
  conventions: 13,
  // Local-first section
  "local-first": 20,
  playgrounds: 21,
  relay: 22,
  migrations: 23,
  "time-travel": 24,
  indexes: 25,
  privacy: 26,
  faq: 27,
  // API reference last
  "api-reference": 100,
};

export const excludePaths = ["showcase", "examples", "comparison"];

/** Pages to exclude from llms.txt (still available via direct .md URL) */
const llmsExcludePaths = [
  "/docs/showcase",
  "/docs/examples",
  "/docs/comparison",
  "https://", // External links
];

const defaultBaseUrl = "https://www.evolu.dev";

/** Creates file list from navigation, preserving order */
const createFileListFromNavigation = (baseUrl: string): Array<string> => {
  const links: Array<string> = [];

  for (const group of navigation) {
    for (const link of group.links) {
      // Skip external links and excluded paths
      if (llmsExcludePaths.some((exclude) => link.href.startsWith(exclude))) {
        continue;
      }

      // Handle root /docs path
      const path = link.href === "/docs" ? "/docs/index.md" : `${link.href}.md`;
      links.push(`- [${link.title}](${baseUrl}${path})`);
    }
  }

  return links;
};

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

export const createLlmsIndex = async ({
  includeApiReference = false,
  baseUrl = defaultBaseUrl,
}: {
  includeApiReference?: boolean;
  baseUrl?: string;
} = {}): Promise<string> => {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  const lines: Array<string> = [
    "# Evolu",
    "",
    "> Evolu is a TypeScript library and local-first platform.",
    "",
    "Use these links for LLM-friendly documentation.",
    "",
    "## Docs",
    ...createFileListFromNavigation(normalizedBaseUrl),
  ];

  if (includeApiReference) {
    const pages = await fetchProcessedMdxPages(true);
    const apiReferencePages = pages.filter((page) =>
      page.path.includes("/api-reference"),
    );
    lines.push("", "## API reference");
    lines.push(
      ...apiReferencePages.map((page) => {
        const normalizedPath = page.path
          .replace(/^\/\(docs\)\/docs/, "/docs")
          .replace(/\/$/, "");
        return `- [${page.title}](${normalizedBaseUrl}${normalizedPath}.md)`;
      }),
    );
  } else {
    lines.push(
      "",
      "## Optional",
      `- [Full docs with API reference](${normalizedBaseUrl}/llms-full.txt)`,
    );
  }

  return lines.join("\n");
};
