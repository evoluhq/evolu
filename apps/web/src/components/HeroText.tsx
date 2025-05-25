"use client";

import clsx from "clsx";
import React from "react";

export function HeroText({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <p className={clsx("lead w-full text-balance", className)}>
      Privacy-focused local&#8209;first platform that scales.
    </p>
  );
}
