import type { Evolu } from "@evolu/common/local-first";
import { createContext } from "react";

export const EvoluContext = /*#__PURE__*/ createContext<Evolu<any> | null>(
  null,
);
