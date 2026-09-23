"use client";

import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();

import dynamic from "next/dynamic";

// SQLite and the worker dependencies are initialized in the browser.
const EvoluSyncExample = dynamic(
  () => import("./EvoluSyncExample").then((mod) => mod.EvoluSyncExample),
  { ssr: false },
);

export default function Page(): React.ReactElement {
  return <EvoluSyncExample />;
}
