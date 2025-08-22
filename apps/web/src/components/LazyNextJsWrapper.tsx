"use client";

import { JSX, lazy, Suspense } from "react";

const NextJsExample = lazy(() =>
  import("@/components/NextJsExample").then((mod) => ({
    default: mod.NextJsExample,
  })),
);

export function LazyNextJsWrapper(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-center">Loading NextJS example...</div>
      }
    >
      <NextJsExample />
    </Suspense>
  );
}
