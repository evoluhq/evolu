import type { Evolu } from "@evolu/common/evolu";
import { defineComponent } from "vue";
import { provideEvolu } from "./provideEvolu.js";

export const EvoluProvider = defineComponent({
  name: "EvoluProvider",
  props: {
    evolu: {
      type: Object as () => Evolu<any>,
      required: true,
    },
  },
  setup(props, { slots }) {
    provideEvolu(props.evolu);
    return () => slots.default?.();
  },
});
