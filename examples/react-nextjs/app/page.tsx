"use client";

import dynamic from "next/dynamic";

// Evolu is currently client-only. Server-side rendering support is planned for
// the future.
const EvoluMinimalExample = dynamic(
  () =>
    import("@/components/EvoluMinimalExample").then(
      (mod) => mod.EvoluMinimalExample,
    ),
  { ssr: false },
);

export default function Home(): React.ReactNode {
  return <EvoluMinimalExample />;
}
