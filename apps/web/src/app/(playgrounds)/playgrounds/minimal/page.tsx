"use client";

import dynamic from "next/dynamic";

const NextJsPlaygroundMinimal = dynamic(
  () =>
    import("@/components/NextJsPlaygroundMinimal").then((mod) => ({
      default: mod.NextJsPlaygroundMinimal,
    })),
  { ssr: false },
);

export default function Page(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-100">
      <NextJsPlaygroundMinimal />
    </div>
  );
}
