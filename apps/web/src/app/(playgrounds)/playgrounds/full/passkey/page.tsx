"use client";

import dynamic from "next/dynamic";
import type { FC } from "react";

// SQLite, the worker dependencies, and WebAuthn exist only in the browser.
const PasskeyExample = dynamic(
  () => import("./PasskeyExample").then((mod) => mod.PasskeyExample),
  { ssr: false },
);

const Page: FC = () => (
  <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-100">
    <PasskeyExample />
  </div>
);

export default Page;
