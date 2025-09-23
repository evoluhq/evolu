"use client";

import { NextJsPlaygroundFull } from "@/components/NextJsPlaygroundFull";
import noSsr from "@/lib/noSsr";

function Page(): React.ReactElement {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <NextJsPlaygroundFull />
    </div>
  );
}

export default noSsr(Page);
