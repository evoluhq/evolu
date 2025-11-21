"use client";

import { Evolu } from "@evolu/common/local-first";
import { ReactNode } from "react";
import { EvoluContext } from "./EvoluContext.js";

export const EvoluProvider = ({
  children,
  value,
}: {
  readonly children?: ReactNode | undefined;
  readonly value: Evolu<any>;
}): React.ReactElement => <EvoluContext value={value}>{children}</EvoluContext>;
