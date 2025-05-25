import { Evolu } from "@evolu/common/evolu";
import { createContext } from "react";

export const EvoluContext = createContext<Evolu<any> | null>(null);
