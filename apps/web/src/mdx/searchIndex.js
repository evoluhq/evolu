// This file is populated by the webpack loader in search.mjs
// The DATA placeholder gets replaced with actual search data at build time

import {
  createSearch,
  getOriginalName,
  splitIntoWords,
} from "./searchUtils.mjs";

const data = "DATA_PLACEHOLDER";

const normalizeApiReferenceTitle = (title) =>
  title.replace(/ - API reference$/, "");

const getApiReferenceKind = (url) => {
  if (url.includes("/interfaces/")) return "Interface";
  if (url.includes("/variables/")) return "Variable";
  if (url.includes("/functions/")) return "Function";
  if (url.includes("/type-aliases/")) return "Type alias";
  if (url.includes("/classes/")) return "Class";
  if (url.includes("/enums/")) return "Enum";
  return null;
};

/** Get a prefix based on URL path for titles that don't have one. */
const getPrefix = (url, title) => {
  // Already has a prefix like "API Reference / ..." from TypeDoc
  if (title.includes(" / ")) return "";
  if (url.startsWith("/docs/api-reference")) return "API Reference › ";
  if (url.startsWith("/blog/")) return "Blog › ";
  if (url.startsWith("/docs/")) return "Docs › ";
  return "";
};

// Build a flat list of all searchable items
const items = [];
for (const { url, sections } of data) {
  for (const [title, hash, content] of sections) {
    const normalizedTitle = normalizeApiReferenceTitle(title);
    const originalName = getOriginalName(title);
    const name = originalName.toLowerCase();
    // Skip generic index pages
    if (name === "index") continue;
    const words = splitIntoWords(originalName);
    const prefix = getPrefix(url, title);
    const apiReferenceKind = getApiReferenceKind(url);
    const pageTitle = hash ? normalizeApiReferenceTitle(sections[0][0]) : null;
    const pageLabel =
      apiReferenceKind && pageTitle
        ? `${pageTitle} › ${apiReferenceKind}`
        : pageTitle;
    // For sections, include page title to distinguish (e.g., "Type › Array" vs "Array")
    const displayTitle = pageTitle
      ? prefix + pageLabel + " › " + normalizedTitle
      : prefix +
        normalizedTitle +
        (apiReferenceKind ? ` › ${apiReferenceKind}` : "");
    items.push({
      url: url + (hash ? "#" + hash : ""),
      title: displayTitle,
      name,
      words,
      pageTitle,
      content: [title, ...content].join(" ").toLowerCase(),
    });
  }
}

const searchFn = createSearch(items, { limit: 30 });

export const search = (query) => {
  const results = searchFn(query);
  return results.map((item) => ({
    url: item.url,
    title: item.title,
    pageTitle: item.pageTitle,
  }));
};
