import { Evolu } from "@evolu/common";
import {
  ComponentInternalInstance,
  getCurrentInstance,
  InjectionKey,
  provide,
} from "vue";

/**
 * Stores the Evolu instance for a Vue component. This is most useful at the
 * root component where provide/inject doesn't work.
 */
export const evoluInstanceMap = new WeakMap<
  ComponentInternalInstance,
  Evolu<any>
>();

/** The injection key for providing Evolu */
export const EvoluContext: InjectionKey<Evolu<any> | null> =
  Symbol("EvoluContext");

/** Provide the Evolu instance to components via Vue's provide/inject system */
export function provideEvolu(evolu: Evolu<any> | (() => Evolu<any>)): void {
  const vueInstance = getCurrentInstance();

  if (!vueInstance) {
    throw new Error(
      "provideEvolu() must be called from within a Vue component's setup()",
    );
  }

  // Allows a factory function
  const instance = typeof evolu === "function" ? evolu() : evolu;

  // We provide via Vue's dependency injection system (provide/inject)
  provide(EvoluContext, instance);

  // This is a workaround to allow injecting Evolu on the same component where it was provided,
  // which is not supported by vanilla provide()/inject().
  evoluInstanceMap.set(vueInstance, instance);
}
