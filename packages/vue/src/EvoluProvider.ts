import { Evolu } from "@evolu/common/evolu";
import { EvoluContext } from "./EvoluContext.js";
import { defineComponent, provide } from "vue";

export const EvoluProvider = defineComponent({
  name: "EvoluProvider",
  props: {
    evolu: {
      type: Object as () => Evolu<any>,
      required: true,
    },
  },
  setup(props, { slots }) {
    provide(EvoluContext, props.evolu);
    return () => slots.default?.();
  },
});
