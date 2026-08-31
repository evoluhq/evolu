import searchPagesJson from "../data/searchIndex.json" with { type: "json" };
import { createSearch } from "./createSearch.ts";

export type { Result } from "./createSearch.ts";

export const search = /*#__PURE__*/ createSearch(searchPagesJson);
