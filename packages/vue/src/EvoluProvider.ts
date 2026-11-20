import type { AppOwnerEvolu, createEvolu } from "@evolu/common/local-first";
import { defineComponent } from "vue";
import type { EvoluAppProvider } from "./EvoluAppProvider.ts";
import { provideEvolu } from "./provideEvolu.ts";

/**
 * Provides the instance of its `evolu` prop to its default slot through
 * {@link provideEvolu}, such as one of {@link createEvolu}. The prop is read
 * once, so key the component by the instance when it changes.
 * {@link EvoluAppProvider} renders it for the AppOwner a tab has open.
 */
export const EvoluProvider = /*#__PURE__*/ defineComponent({
  name: "EvoluProvider",
  props: {
    evolu: {
      type: Object as () => AppOwnerEvolu<any>,
      required: true,
    },
  },
  setup(props, { slots }) {
    provideEvolu(props.evolu);
    return () => slots.default?.();
  },
});
