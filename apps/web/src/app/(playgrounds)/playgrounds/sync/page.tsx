"use client";

import dynamic from "next/dynamic";
import type { FC } from "react";

// SQLite and the worker dependencies are initialized in the browser.
const EvoluSyncExample = dynamic(
  () => import("./EvoluSyncExample").then((mod) => mod.EvoluSyncExample),
  { ssr: false },
);

const Page: FC = () => <EvoluSyncExample />;

export default Page;
