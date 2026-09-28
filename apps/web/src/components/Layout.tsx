"use client";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Logo } from "@/components/Logo";
import { Navigation } from "@/components/Navigation";
import { type Section, SectionProvider } from "@/components/SectionProvider";
import sections from "@/data/sections.json";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Imported by this client module rather than passed from the server layout: a
// prop would serialize the whole map into every docs page's RSC payload, while
// the import ships it once in a cached chunk. Sending only the current page's
// sections would need page data to reach this persistent layout before the
// sidebar renders, which works only by relying on Next internals (a React.cache
// promise shared with a parallel-route slot).
const sectionsByRoute: Readonly<Record<string, Array<Section>>> = sections;

export const Layout = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => {
  const pathname = usePathname();

  return (
    <SectionProvider sections={sectionsByRoute[pathname] ?? []}>
      <div className="h-full lg:ml-72 xl:ml-80">
        <motion.header
          layoutScroll
          className="contents lg:pointer-events-none lg:fixed lg:inset-0 lg:z-40 lg:flex"
        >
          <div className="contents lg:pointer-events-auto lg:block lg:w-72 lg:overflow-y-auto lg:border-r lg:border-zinc-900/10 lg:px-6 lg:pt-4 lg:pb-8 xl:w-80 lg:dark:border-white/10">
            <Header />
            <div className="hidden lg:flex">
              <Link href="/" aria-label="Home">
                <Logo className="h-5" />
              </Link>
            </div>
            <Navigation className="hidden lg:mt-10 lg:block" />
          </div>
        </motion.header>
        <div className="relative flex h-full flex-col px-4 pt-14 sm:px-6 lg:px-8">
          <main className="flex-auto">{children}</main>
          <Footer />
        </div>
      </div>
    </SectionProvider>
  );
};
