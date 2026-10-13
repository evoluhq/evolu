"use client";

import dynamic from "next/dynamic";
import type { FC } from "react";

/**
 * Evolu supports server-side rendering (SSR) even with web-only deps, but
 * that's only practical if we want to render empty rows and don't care about
 * the layout shift when the client hydrates.
 *
 * Evolu can also SSR data with server deps (check tests). Use it only for
 * non-private (public or shared) data.
 */
const EvoluMinimalExample = dynamic(
  () =>
    import("@/components/EvoluMinimalExample").then(
      (mod) => mod.EvoluMinimalExample,
    ),
  { ssr: false },
);

const Home: FC = () => <EvoluMinimalExample />;

export default Home;
