"use client";

import dynamic from "next/dynamic";

const Playground = dynamic(
  () =>
    import("@/components/NextJsPlaygroundMinimal").then(
      (mod) => mod.NextJsPlaygroundMinimal,
    ),
  {
    ssr: false,
  },
);

export default function Page(): React.ReactElement {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <Playground />
    </div>
  );
}
