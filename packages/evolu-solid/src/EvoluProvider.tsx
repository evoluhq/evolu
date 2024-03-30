"use client";

import { Evolu, DatabaseSchema } from "@evolu/common";
import { EvoluContext } from "./EvoluContext.js";
import type { JSX } from "solid-js";

export const EvoluProvider = <S extends DatabaseSchema>({
  children,
  value,
}: {
  readonly children?: JSX.Element | undefined;
  readonly value: Evolu<S>;
}): JSX.Element => {
  return (
    <EvoluContext.Provider value={value as Evolu}>
      {children}
    </EvoluContext.Provider>
  );
};
