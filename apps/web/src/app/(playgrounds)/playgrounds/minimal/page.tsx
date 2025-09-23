"use client";

import { NextJsPlaygroundMinimal } from "@/components/NextJsPlaygroundMinimal";
import noSsr from "@/lib/noSsr";

function Page(): React.ReactElement {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <NextJsPlaygroundMinimal />
    </div>
  );
}

export default noSsr(Page);
