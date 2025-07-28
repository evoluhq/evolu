import { Evolu } from "@evolu/common";
import { EvoluContext } from "./EvoluContext.js";
import { ComponentInternalInstance, getCurrentInstance, provide } from "vue";

export const evoluInstanceMap = new WeakMap<
  ComponentInternalInstance,
  Evolu<any>
>();

export function provideEvolu(evolu: Evolu<any>): void {
  const vueInstance = getCurrentInstance();

  if (!vueInstance) return;

  provide(EvoluContext, evolu);

  evoluInstanceMap.set(vueInstance, evolu);
}
