// This file is populated by the webpack loader in search.mjs
// The DATA placeholder gets replaced with actual search data at build time
//
// Search algorithm (restart Next.js after changes):
//   Priority tiers (results grouped in this order):
//     1. Exact name match (e.g., "evolu" matches Evolu)
//     2. Name starts with query (e.g., "ev" matches Evolu, EvoluConfig)
//     3. Name contains query as word (e.g., "array" matches NonEmptyArray)
//     4. Title contains query anywhere
//     5. Content contains query (3+ chars only)
//   Within each tier, shorter names come first.
//   Index pages are excluded.

const data = "DATA_PLACEHOLDER";

/**
 * Extract the actual name from a title. "API Reference / Interface: Evolu<S>"
 * -> "evolu" "Evolu Relay" -> "evolu relay" "Interface: Foo" -> "foo"
 */
const getName = (title) => {
  let t = title.toLowerCase();
  // Remove generic parameters like <T, E>
  t = t.replace(/<[^>]*>/g, "");
  // Get the part after last colon or slash
  const parts = t.split(/[:/]/);
  return parts[parts.length - 1].trim();
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
    const name = getName(title);
    // Skip generic index pages
    if (name === "index") continue;
    const prefix = getPrefix(url, title);
    const pageTitle = hash ? sections[0][0] : null;
    // For sections, include page title to distinguish (e.g., "Type › Array" vs "Array")
    const displayTitle = pageTitle
      ? prefix + pageTitle + " › " + title
      : prefix + title;
    items.push({
      url: url + (hash ? "#" + hash : ""),
      title: displayTitle,
      name,
      pageTitle,
      content: [title, ...content].join(" ").toLowerCase(),
    });
  }
}

export const search = (query, options = {}) => {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const limit = options.limit || 30;

  // Group results by priority tier
  const tier1 = []; // Exact name match
  const tier2 = []; // Name starts with query
  const tier3 = []; // Name contains query as a word
  const tier4 = []; // Title contains query
  const tier5 = []; // Content contains query

  const seen = new Set();

  const addTo = (tier, item) => {
    if (seen.has(item)) return;
    seen.add(item);
    tier.push(item);
  };

  // 1. Exact name match
  for (const item of items) {
    if (item.name === q) {
      addTo(tier1, item);
    }
  }

  // 2. Name starts with query
  for (const item of items) {
    if (item.name.startsWith(q)) {
      addTo(tier2, item);
    }
  }

  // 3. Name contains query as a word
  for (const item of items) {
    const words = item.name.split(/[^a-z0-9]+/);
    if (words.some((w) => w.startsWith(q))) {
      addTo(tier3, item);
    }
  }

  // 4. Title contains query (for broader matches)
  for (const item of items) {
    if (item.title.toLowerCase().includes(q)) {
      addTo(tier4, item);
    }
  }

  // 5. Content contains query (only if query is 3+ chars)
  if (q.length >= 3) {
    for (const item of items) {
      if (item.content.includes(q)) {
        addTo(tier5, item);
      }
    }
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

  const results = [
    ...sortTier(tier1),
    ...sortTier(tier2),
    ...sortTier(tier3),
    ...sortTier(tier4),
    ...sortTier(tier5),
  ];

  return results.slice(0, limit).map((item) => ({
    url: item.url,
    title: item.title,
    pageTitle: item.pageTitle,
  }));
};
