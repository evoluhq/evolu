"use client";

import { usePathname } from "next/navigation";
import { IconFileText } from "@tabler/icons-react";

export function LlmLink(): React.ReactElement | null {
  const pathname = usePathname();

  // Only show on docs pages
  if (!pathname.startsWith("/docs")) {
    return null;
  }

  // Build the .md URL
  const mdPath = pathname === "/docs" ? "/docs/index.md" : `${pathname}.md`;

  return (
    <div className="mt-8 flex items-center gap-2 border-t border-zinc-900/5 pt-6 text-sm text-zinc-500 dark:border-white/5 dark:text-zinc-400">
      <IconFileText className="size-4" />
      <a href={mdPath} className="hover:text-zinc-700 dark:hover:text-zinc-300">
        Markdown for LLMs
      </a>
    </div>
  );
}
