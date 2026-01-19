import type { PluggableList } from "unified";
import { type SearchOptions } from "flexsearch";

declare module "@/mdx/search.mjs" {
  export interface Result {
    url: string;
    title: string;
    pageTitle?: string;
  }

  export function search(query: string, options?: SearchOptions): Array<Result>;
}

declare module "../src/mdx/rehype.mjs" {
  export const rehypePlugins: PluggableList;
}

declare module "../src/mdx/remark.mjs" {
  export const remarkPlugins: PluggableList;
}
