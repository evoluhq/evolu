import { test } from "vitest";
import { createSSRApp, defineComponent, h, nextTick, Suspense } from "vue";
import { assertEqual } from "../../../../packages/common/src/Assert.ts";
import type { Evolu } from "../../../../packages/common/src/local-first/Evolu.ts";
import { testAppOwner } from "../../../../packages/common/src/local-first/Owner.ts";
import type {
  CompleteSyncRoute,
  OwnerSyncStatus,
  SyncState,
} from "../../../../packages/common/src/local-first/Shared.ts";
import { createStore } from "../../../../packages/common/src/Store.ts";
import { testCreateDeps } from "../../../../packages/common/src/Task.ts";
import { Millis } from "../../../../packages/common/src/Time.ts";
import { createId, testName } from "../../../../packages/common/src/Type.ts";
import { EvoluContext } from "../../../../packages/vue/src/provideEvolu.ts";
import { useOwnerSyncStatus } from "../../../../packages/vue/src/useOwnerSyncStatus.ts";

const transportId = createId<"SyncTransport">(testCreateDeps());

const completeRoute: CompleteSyncRoute = {
  type: "Complete",
  transportId,
  completeAt: Millis.orThrow(2000),
  lastSentAt: Millis.orThrow(1500),
  lastReceivedAt: Millis.orThrow(2000),
};

/** A snapshot in which the app owner is synced. */
const syncedState: SyncState = {
  transports: [
    {
      type: "WebSocket",
      id: transportId,
      label: "wss://relay.example",
      connection: { type: "Open", openedAt: Millis.orThrow(1000), error: null },
    },
  ],
  tenants: [
    {
      type: "Active",
      name: testName,
      owners: [
        { type: "Writable", ownerId: testAppOwner.id, routes: [completeRoute] },
      ],
    },
  ],
};

// Only name and appOwner are used by the composable.
const evolu = {
  name: testName,
  appOwner: testAppOwner,
} as Pick<Evolu, "name" | "appOwner"> as Evolu;

/**
 * Hydrates a component that renders the app owner's status type in a class and
 * text over what server rendering produced, collecting Vue warnings, such as
 * hydration mismatches.
 */
const setupHydratedSyncStatus = async (initialState: SyncState | null) => {
  const syncState = createStore<SyncState | null>(initialState);
  const statuses: Array<OwnerSyncStatus["type"]> = [];
  const SyncStatus = defineComponent({
    setup: () => {
      // oxlint-disable-next-line react/rules-of-hooks -- A Vue composable runs in setup.
      const status = useOwnerSyncStatus(syncState);
      return () => {
        const { type } = status.value;
        statuses.push(type);
        return h("p", { class: type }, type);
      };
    },
  });
  const container = document.createElement("div");
  container.innerHTML = '<p class="NoRelays">NoRelays</p>';

  const warnings: Array<string> = [];
  const app = createSSRApp(SyncStatus);
  app.config.warnHandler = (message) => {
    warnings.push(message);
  };
  app.provide(EvoluContext, evolu);
  app.mount(container);
  await nextTick();

  return {
    syncState,
    statuses,
    warnings,
    container,
    [Symbol.dispose]: () => {
      app.unmount();
      syncState[Symbol.dispose]();
    },
  };
};

test("returns NoRelays while hydrating, then the store's status", async () => {
  using setup = await setupHydratedSyncStatus(syncedState);

  assertEqual(setup.warnings, []);
  assertEqual(setup.statuses, ["NoRelays", "Synced"]);
  assertEqual(setup.container.innerHTML, '<p class="Synced">Synced</p>');
});

test("hydrates before the first snapshot without rendering again", async () => {
  using setup = await setupHydratedSyncStatus(null);

  assertEqual(setup.warnings, []);
  assertEqual(setup.statuses, ["NoRelays"]);
  assertEqual(setup.container.innerHTML, '<p class="NoRelays">NoRelays</p>');

  setup.syncState.set(syncedState);
  await nextTick();
  assertEqual(setup.container.innerHTML, '<p class="Synced">Synced</p>');
});

test("reads the store after an async setup hydrates", async () => {
  let resume = (): void => {};
  const resumed = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const syncState = createStore<SyncState | null>(null);
  const AsyncSyncStatus = defineComponent({
    setup: async () => {
      // oxlint-disable-next-line react/rules-of-hooks -- A Vue composable runs in setup.
      const status = useOwnerSyncStatus(syncState);
      await resumed;
      return () => h("p", { class: status.value.type }, status.value.type);
    },
  });
  const container = document.createElement("div");
  container.innerHTML = '<p class="NoRelays">NoRelays</p>';
  const warnings: Array<string> = [];
  const app = createSSRApp({
    render: () => h(Suspense, null, { default: () => h(AsyncSyncStatus) }),
  });
  app.config.warnHandler = (message) => {
    warnings.push(message);
  };
  app.provide(EvoluContext, evolu);

  app.mount(container);
  // The first snapshot arrives while the setup waits.
  syncState.set(syncedState);
  resume();
  // Suspense resolves the setup, hydrates, and mounts in later tasks.
  await new Promise((resolve) => {
    setTimeout(resolve);
  });
  await nextTick();

  assertEqual(warnings, []);
  assertEqual(container.innerHTML, '<p class="Synced">Synced</p>');
  app.unmount();
});
