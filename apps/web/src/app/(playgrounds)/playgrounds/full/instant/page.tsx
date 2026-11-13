"use client";

import dynamic from "next/dynamic";
import type { FC } from "react";

// SQLite and the worker dependencies exist only in the browser, and
// InstantStartExample creates the app at module scope, so the module loads only
// there.
const InstantStartExample = dynamic(
  () => import("./InstantStartExample").then((mod) => mod.InstantStartExample),
  { ssr: false },
);

const Page: FC = () => (
  <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-100">
    <InstantStartExample />
  </div>
);

export default Page;
