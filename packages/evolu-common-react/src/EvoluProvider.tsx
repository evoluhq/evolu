import { Evolu, Schema } from "@evolu/common";
import { ReactNode } from "react";
import { EvoluContext } from "./EvoluContext.js";

export const EvoluProvider = <S extends Schema>({
  children,
  value,
}: {
  readonly children?: ReactNode | undefined;
  readonly value: Evolu<S>;
}): JSX.Element => (
  <EvoluContext.Provider value={value as Evolu}>
    {children}
  </EvoluContext.Provider>
);
