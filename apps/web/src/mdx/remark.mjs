import { mdxAnnotations } from "mdx-annotations";
import remarkGfm from "remark-gfm";

export const remarkPlugins = [
  // oxlint-disable-next-line typescript/no-unsafe-member-access -- mdx-annotations ships without types; apps/web/mdx-annotations.d.ts supplies this Unified plugin contract.
  mdxAnnotations.remark,
  remarkGfm,
];

export default { plugins: remarkPlugins };
