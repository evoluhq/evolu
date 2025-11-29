"use client";

import dynamic from "next/dynamic";

/**
 * Using dynamic with ssr: false emulates SPA behavior in Next.js.
 *
 * Evolu supports SSR (server-side rendering), but because data is end-to-end
 * encrypted, it must stay on clients - so SSR will render empty rows. If SSR
 * with data is needed, use server deps to render public or shared data (check
 * tests).
 */
const EvoluMinimalExample = dynamic(
  () => import("./EvoluMinimalExample").then((mod) => mod.EvoluMinimalExample),
  { ssr: false },
);

export default function Page(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-100">
      <EvoluMinimalExample />
    </div>
  );
}
