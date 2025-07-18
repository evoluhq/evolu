import { Evolu } from "@evolu/common/evolu";
import { InjectionKey } from "vue";

export const EvoluContext: InjectionKey<Evolu<any> | null> =
  Symbol("EvoluContext");
