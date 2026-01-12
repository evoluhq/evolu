/**
 * Shared utilities for search indexing.
 *
 * Used by both searchIndex.js (production) and search.test.mjs (tests).
 */

/**
 * Extract title from MDX metadata export.
 *
 * Handles: `export const metadata = { title: 'Some Title' };`
 */
export const extractMetadataTitle = (mdx) => {
  const match =
    /export\s+const\s+metadata\s*=\s*\{\s*title:\s*['"]([^'"]+)['"]/m.exec(mdx);
  return match ? match[1] : null;
};

/**
 * Add synthetic h1 from metadata if sections has no h1.
 *
 * Sections format: [[title, hash, content[]], ...] h1 sections have hash =
 * null.
 */
export const addSyntheticH1 = (sections, mdx) => {
  const hasH1 = sections.length > 0 && sections[0][1] === null;
  if (!hasH1) {
    const metadataTitle = extractMetadataTitle(mdx);
    if (metadataTitle) {
      sections.unshift([metadataTitle, null, []]);
    }
  }
  return sections;
};

/**
 * Extract the actual name from a title, preserving original casing.
 *
 * - "mapArray - API reference" -> "mapArray"
 * - "Interface: Evolu<S>" -> "Evolu"
 * - "API Reference / Array" -> "Array"
 */
export const getOriginalName = (title) => {
  // Remove generic parameters like <T, E>
  let t = title.replace(/<[^>]*>/g, "");
  // Get the part after last colon, slash, or " - " separator
  const parts = t.split(/[:/]| - /);
  // For titles with " - ", the name is before the separator
  if (title.includes(" - ")) {
    return parts[0].trim();
  }
  return parts[parts.length - 1].trim();
};

/**
 * Split a name into searchable words, handling camelCase.
 *
 * - "useQuery" -> ["use", "query"]
 * - "NonEmptyReadonlyArray" -> ["non", "empty", "readonly", "array"]
 */
export const splitIntoWords = (name) =>
  name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);

/**
 * Create a search function from a list of items.
 *
 * Items must have: url, title, name (lowercase), words (from splitIntoWords).
 * Optionally: content (for full-text search).
 */
export const createSearch = (items, options = {}) => {
  const limit = options.limit || 30;

  return (query) => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const tiers = [[], [], [], [], []];
    const seen = new Set();

    const add = (tier, item) => {
      if (!seen.has(item)) {
        seen.add(item);
        tiers[tier].push(item);
      }
    };

    for (const item of items) {
      if (item.name === q) add(0, item);
      else if (item.name.startsWith(q)) add(1, item);
      else if (item.words.some((w) => w.startsWith(q))) add(2, item);
      else if (item.title.toLowerCase().includes(q)) add(3, item);
      else if (q.length >= 3 && item.content?.includes(q)) add(4, item);
    }

    // Sort within each tier: prefer shorter names, then non-hash URLs
    const sortTier = (tier) =>
      tier.sort((a, b) => {
        const lenDiff = a.name.length - b.name.length;
        if (lenDiff !== 0) return lenDiff;
        const aHash = a.url.includes("#") ? 1 : 0;
        const bHash = b.url.includes("#") ? 1 : 0;
        return aHash - bHash;
      });

    return tiers.flatMap(sortTier).slice(0, limit);
  };
};
