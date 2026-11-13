"use client";

import dynamic from "next/dynamic";
import type { FC } from "react";

// SQLite and the worker dependencies exist only in the browser, and
// EvoluMinimalExample creates the app at module scope, so the module loads only
// there.
const EvoluMinimalExample = dynamic(
  () => import("./EvoluMinimalExample").then((mod) => mod.EvoluMinimalExample),
  { ssr: false },
);

const Page: FC = () => (
  <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-100">
    <EvoluMinimalExample />
  </div>
);

export default Page;
