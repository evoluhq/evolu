import { Evolu } from "@evolu/common";
import {
  ComponentInternalInstance,
  getCurrentInstance,
  InjectionKey,
  provide,
} from "vue";

export const evoluInstanceMap = new WeakMap<
  ComponentInternalInstance,
  Evolu<any>
>();

export const EvoluContext: InjectionKey<Evolu<any> | null> =
  Symbol("EvoluContext");

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
