import { type Metadata } from "next";
import type { FC, ReactNode } from "react";

import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: {
    template: "%s - Evolu",
    default: "Local-first platform - Evolu",
  },
  alternates: {
    types: {
      "application/rss+xml": [
        {
          title: "Evolu Blog",
          url: "https://www.evolu.dev/blog/rss.xml",
        },
      ],
    },
  },
};

const RootLayout: FC<{ children: ReactNode }> = ({ children }) => (
  <html lang="en" className="h-full" suppressHydrationWarning>
    <body className="flex min-h-full bg-white antialiased dark:bg-zinc-900">
      <Providers>
        <div className="w-full">{children}</div>
      </Providers>
    </body>
  </html>
);

export default RootLayout;
