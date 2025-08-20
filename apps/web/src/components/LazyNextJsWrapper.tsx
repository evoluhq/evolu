"use client";

import { lazy, Suspense } from "react";

const NextJsExample = lazy(() =>
  import("@/components/NextJsExample").then((mod) => ({
    default: mod.NextJsExample,
  })),
);

export function LazyNextJsWrapper() {
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
