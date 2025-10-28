"use client";

import dynamic from "next/dynamic";

// Evolu is currently client-only. Server-side rendering support is planned for
// the future.
const EvoluFullExample = dynamic(
  () =>
    import("@/components/EvoluFullExample").then((mod) => mod.EvoluFullExample),
  {
    ssr: false,
  },
);

export default function Page(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-100">
      <EvoluFullExample />
    </div>
  );
}
