import { Evolu } from "@evolu/common/evolu";
import { createContext } from "solid-js";

export const EvoluContext = createContext<Evolu<any> | null>(null);
