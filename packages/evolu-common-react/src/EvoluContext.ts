import { Evolu } from "@evolu/common";
import { createContext } from "react";

export const EvoluContext = createContext<Evolu | null>(null);
