import { type MDXComponents } from "mdx/types";

import * as mdxComponents from "@/components/mdx";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function useMDXComponents(components: MDXComponents) {
  return {
    ...components,
    ...mdxComponents,
  };
}
