"use client";

import dynamic from "next/dynamic";

// Evolu can be server-side rendered but it's better to use client-only rendering
// to avoid layout shift. Evolu supports SSR because some apps may require it
// but it will not render any data because Evolu data are client only.
const NextJsPlaygroundMinimal = dynamic(
  () =>
    import("@/components/NextJsPlaygroundMinimal").then(
      (mod) => mod.NextJsPlaygroundMinimal,
    ),
  { ssr: false },
);

export default function Page(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-100">
      <NextJsPlaygroundMinimal />
    </div>
  );
}
