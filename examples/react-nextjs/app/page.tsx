"use client";

import dynamic from "next/dynamic";

// Evolu can be server-side rendered but it's better to use client-only rendering
// to avoid layout shift. Evolu supports SSR because some apps may require it
// but it will not render any data because Evolu data are client only.
const NextJsExample = dynamic(
  () => import("@/components/NextJsExample").then((mod) => mod.EvoluDemo),
  { ssr: false },
);

export default function Home(): React.ReactNode {
  return <NextJsExample />;
}
