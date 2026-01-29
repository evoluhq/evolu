import type { Evolu } from "@evolu/common/local-first";
import { defineComponent } from "vue";
import { provideEvolu } from "./provideEvolu.js";

export const EvoluProvider = /*#__PURE__*/ defineComponent({
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
