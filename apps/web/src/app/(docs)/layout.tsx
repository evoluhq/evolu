// import glob from "fast-glob";
import { type Metadata } from "next";

import { Providers } from "@/app/providers";
import { Layout } from "@/components/Layout";
// import { type Section } from "@/components/SectionProvider";

import "@/styles/tailwind.css";

export const metadata: Metadata = {
  title: {
    template: "%s - Evolu",
    default: "TypeScript library and local-first platform",
  },
};

// eslint-disable-next-line @typescript-eslint/require-await
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  // Dev note: Do not re-enable glob + importing every MDX file here;
  // it makes build and hot reload slow.

  // const pages = await glob("**/*.mdx", { cwd: "src/app/(docs)" });
  // const allSectionsEntries = (await Promise.all(
  //   pages.map(async (filename) => [
  //     "/" + filename.replace(/(^|\/)page\.mdx$/, ""),
  //     // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  //     (await import(`./${filename}`)).sections,
  //   ]),
  // )) as Array<[string, Array<Section>]>;
  // const allSections = Object.fromEntries(allSectionsEntries);
  const allSections = {};

  return (
    <Providers>
      <Layout allSections={allSections}>{children}</Layout>
    </Providers>
  );
}
