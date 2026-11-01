"use client";

import dynamic from "next/dynamic";
import type { FC } from "react";

// SQLite and the worker dependencies are initialized in the browser.
const EvoluLocalOnlyExample = dynamic(
  () =>
    import("./EvoluLocalOnlyExample").then((mod) => mod.EvoluLocalOnlyExample),
  { ssr: false },
);

const Page: FC = () => (
  <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-100">
    <EvoluLocalOnlyExample />
  </div>
);

export default Page;
