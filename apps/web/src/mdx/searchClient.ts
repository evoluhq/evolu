import searchPagesJson from "../data/searchIndex.json" with { type: "json" };

export interface Result {
  readonly url: string;
  readonly title: string;
  readonly pageTitle: string | null;
}

export interface SearchPage {
  readonly url: string;
  readonly sections: ReadonlyArray<{
    readonly title: string;
    readonly hash: string | null;
    readonly content: ReadonlyArray<string>;
  }>;
}

interface SearchItem extends Result {
  readonly name: string;
  readonly words: ReadonlyArray<string>;
  readonly content: string;
}

const searchPagesToSearchItems = (
  searchPages: ReadonlyArray<SearchPage>,
): ReadonlyArray<SearchItem> => {
  const searchItems: Array<SearchItem> = [];

  for (const { url, sections } of searchPages) {
    const firstSection = sections[0];

    for (const { title, hash, content } of sections) {
      const normalizedTitle = normalizeApiReferenceTitle(title);
      let originalName = title;
      let previousName: string;
      do {
        previousName = originalName;
        originalName = originalName.replaceAll(/<[^>]*>/gu, "");
      } while (originalName !== previousName);

      const nameParts = originalName.split(/[:/]| - /u);
      originalName = title.includes(" - ")
        ? nameParts[0].trim()
        : nameParts.at(-1)!.trim();

      const name = originalName.toLowerCase();
      if (name === "index") continue;

      const words = originalName
        .replaceAll(/([a-z])([A-Z])/gu, "$1 $2")
        .toLowerCase()
        .split(/[^a-z0-9]+/u)
        .filter((word) => word.length > 0);
      const prefix = url.startsWith("/docs/api-reference")
        ? "API Reference › "
        : url.startsWith("/blog/")
          ? "Blog › "
          : url.startsWith("/docs/")
            ? "Docs › "
            : "";
      const apiReferenceKind = url.includes("/interfaces/")
        ? "Interface"
        : url.includes("/variables/")
          ? "Variable"
          : url.includes("/functions/")
            ? "Function"
            : url.includes("/type-aliases/")
              ? "Type alias"
              : url.includes("/classes/")
                ? "Class"
                : null;
      const pageTitle = hash
        ? normalizeApiReferenceTitle(firstSection.title)
        : null;
      const pageLabel =
        apiReferenceKind && pageTitle
          ? `${pageTitle} › ${apiReferenceKind}`
          : pageTitle;
      const displayTitle = pageTitle
        ? `${prefix}${pageLabel} › ${normalizedTitle}`
        : `${prefix}${normalizedTitle}${
            apiReferenceKind ? ` › ${apiReferenceKind}` : ""
          }`;

      searchItems.push({
        url: `${url}${hash ? `#${hash}` : ""}`,
        title: displayTitle,
        name,
        words,
        pageTitle,
        content: [title, ...content].join(" ").toLowerCase(),
      });
    }
  }

  return searchItems;
};

const normalizeApiReferenceTitle = (title: string): string =>
  title.replace(/ - API reference$/u, "");

export const createSearch = (searchPages: ReadonlyArray<SearchPage>) => {
  const searchItems = searchPagesToSearchItems(searchPages);

  return (query: string): ReadonlyArray<Result> => {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return [];

    const itemsByTier: [
      Array<SearchItem>,
      Array<SearchItem>,
      Array<SearchItem>,
      Array<SearchItem>,
      Array<SearchItem>,
    ] = [[], [], [], [], []];

    for (const item of searchItems) {
      let tier: Array<SearchItem> | undefined;
      if (item.name === normalizedQuery) tier = itemsByTier[0];
      else if (item.name.startsWith(normalizedQuery)) tier = itemsByTier[1];
      else if (item.words.some((word) => word.startsWith(normalizedQuery)))
        tier = itemsByTier[2];
      else if (item.title.toLowerCase().includes(normalizedQuery))
        tier = itemsByTier[3];
      else if (
        normalizedQuery.length >= 3 &&
        item.content.includes(normalizedQuery)
      )
        tier = itemsByTier[4];

      if (tier) tier.push(item);
    }

    return itemsByTier
      .flatMap((tier) =>
        tier.toSorted((a, b) => {
          const lengthDifference = a.name.length - b.name.length;
          if (lengthDifference !== 0) return lengthDifference;
          return Number(a.url.includes("#")) - Number(b.url.includes("#"));
        }),
      )
      .slice(0, 30)
      .map(({ url, title, pageTitle }) => ({ url, title, pageTitle }));
  };
};

export const search = /*#__PURE__*/ createSearch(searchPagesJson);
