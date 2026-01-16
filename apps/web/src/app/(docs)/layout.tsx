import { type Metadata } from "next";

import { Providers } from "@/app/providers";
import { Layout } from "@/components/Layout";
import { type Section } from "@/components/SectionProvider";
import allSections from "@/data/sections.json";

import "@/styles/tailwind.css";

export const metadata: Metadata = {
  title: {
    template: "%s - Evolu",
    default: "TypeScript library and local-first platform",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Providers>
      <Layout allSections={allSections as Record<string, Array<Section>>}>
        {children}
      </Layout>
    </Providers>
  );
}
