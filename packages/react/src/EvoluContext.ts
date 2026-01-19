import type { Evolu } from "@evolu/common/local-first";
import { createContext } from "react";

export const EvoluContext = createContext<Evolu<any> | null>(null);
