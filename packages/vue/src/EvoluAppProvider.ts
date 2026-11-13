import {
  subscribeAppOwnerState,
  type AppOwnerState,
  type EvoluApp,
  type EvoluSchema,
} from "@evolu/common/local-first";
import {
  defineComponent,
  h,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  type InjectionKey,
  type PropType,
  type SlotsType,
  type VNode,
} from "vue";
import type { createEvoluBinding } from "./createEvoluBinding.ts";
import { EvoluProvider } from "./EvoluProvider.ts";
import { isServerRendering } from "./isServerRendering.ts";
import type { useAppOwners } from "./useAppOwners.ts";
import type { useEvolu } from "./useEvolu.ts";

/** The injection key for providing an {@link EvoluApp}. */
export const EvoluAppContext: InjectionKey<EvoluApp<any, any> | null> =
  /*#__PURE__*/ Symbol("EvoluAppContext");

/**
 * Provides an {@link EvoluApp} to its slots. The default slot gets the instance
 * of the AppOwner this tab has open, so {@link useEvolu} and the query
 * composables read that AppOwner's data, and `useEvolu().appOwner` is that
 * AppOwner. The slot remounts when the tab opens another AppOwner, or the
 * AppOwner again after a removal and restore or its database's deletion. While
 * the tab has no AppOwner open, such as on a device without one or after a
 * removal of the open one, it renders the `withoutAppOwner` slot, such as a
 * choice to open one of {@link useAppOwners}, create one, or restore one. While
 * the AppOwner's instance opens, it renders the `opening` slot, such as a
 * spinner, and nothing without it. Each slot can call {@link useEvoluApp}.
 *
 * The `app` prop is read once, so pass the resolved app, such as one awaited in
 * `<script setup>` under `<Suspense>`.
 */
export const EvoluAppProvider = /*#__PURE__*/ defineComponent({
  name: "EvoluAppProvider",
  props: {
    app: {
      type: Object as PropType<EvoluApp<any, any>>,
      required: true,
    },
  },
  slots: Object as SlotsType<{
    default?: () => Array<VNode>;
    withoutAppOwner?: () => Array<VNode>;
    opening?: () => Array<VNode>;
  }>,
  setup(props, { slots }) {
    const { app } = props;
    provide(EvoluAppContext, app);

    // Another instance renders the `opening` slot until it opens, and then
    // mounts the default slot's components anew, keyed by the instance, so no
    // state of theirs outlives the database it came from.
    const state = shallowRef<AppOwnerState<any>>(noAppOwnerState);
    if (isServerRendering()) {
      // Server rendering never disposes the component's scope, so it waits for
      // no open and follows nothing there. It renders the state it starts in.
      const current = app.current.get();
      if (current) state.value = { type: "Opening", current };
    } else {
      // An app.open in a caller's watchEffect sets the state synchronously,
      // which only writes the ref, so the effect doesn't track it.
      onScopeDispose(
        subscribeAppOwnerState(app.current, (next) => {
          state.value = next;
        }),
      );
    }

    return () => {
      const { value } = state;
      switch (value.type) {
        case "None":
          return slots.withoutAppOwner?.();
        case "Opening":
          return slots.opening?.() ?? null;
        // A child that mounts for each instance, because a component
        // provides only in its setup.
        case "Open": {
          // Vue keys are strings, numbers, or symbols, so each instance gets
          // a number.
          let key = keysByEvolu.get(value.evolu);
          if (key === undefined) {
            key = nextKey++;
            keysByEvolu.set(value.evolu, key);
          }
          return h(
            EvoluProvider,
            { key, evolu: value.evolu },
            { default: () => slots.default?.() },
          );
        }
      }
    };
  },
});

/**
 * Returns the {@link EvoluApp} from {@link EvoluAppProvider}. Applications should
 * prefer {@link createEvoluBinding} for proper typing.
 */
export const useEvoluApp = (): EvoluApp<EvoluSchema, EvoluSchema> => {
  const app: EvoluApp<EvoluSchema, EvoluSchema> | null = inject(
    EvoluAppContext,
    null,
  );
  if (!app)
    throw new Error(
      "Could not find the EvoluApp. Wrap components with <EvoluAppProvider>.",
    );
  return app;
};

// The keys of the instances, which the "Open" case renders by.
const keysByEvolu = /*#__PURE__*/ new WeakMap<object, number>();
let nextKey = 0;

const noAppOwnerState: AppOwnerState<any> = { type: "None" };
