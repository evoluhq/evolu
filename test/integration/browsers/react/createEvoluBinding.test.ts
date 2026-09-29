import { act, createElement, StrictMode, type FC } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { beforeAll, test } from "vitest";
import {
  assertEqual,
  assertSame,
} from "../../../../packages/common/src/Assert.ts";
import type { Evolu } from "../../../../packages/common/src/local-first/Evolu.ts";
import {
  createOwnerWebSocketTransport,
  deriveShardOwner,
  testAppOwner,
  type Owner,
  type OwnerId,
  type ReadonlyOwner,
} from "../../../../packages/common/src/local-first/Owner.ts";
import type {
  CompleteSyncRoute,
  OwnerSyncStatus,
  PendingSyncRoute,
  SyncConnection,
  SyncRoute,
  SyncState,
} from "../../../../packages/common/src/local-first/Shared.ts";
import { createStore } from "../../../../packages/common/src/Store.ts";
import { testCreateDeps } from "../../../../packages/common/src/Task.ts";
import { Millis } from "../../../../packages/common/src/Time.ts";
import {
  createId,
  Name,
  testName,
} from "../../../../packages/common/src/Type.ts";
import { createEvoluBinding } from "../../../../packages/react/src/local-first/createEvoluBinding.ts";

beforeAll(() => {
  // Tells React that updates are wrapped in act.
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

const { EvoluContext, useOwner, useOwnerSyncStatus } = createEvoluBinding();

/** An Evolu stub that records each owner registration and its release. */
const createEvoluStub = (calls: Array<string>): Evolu =>
  // Only useOwner is used by these components.
  ({
    useOwner: (owner, transports) => {
      const label = `${"writeKey" in owner ? "writable" : "readonly"} ${transports?.map(({ url }) => url.split("?")[0]).join(",")}`;
      calls.push(`use ${label}`);
      return () => {
        calls.push(`unuse ${label}`);
      };
    },
  }) as Pick<Evolu, "useOwner"> as Evolu;

/** Renders components that call `useOwner` under an Evolu stub. */
const setupUseOwner = () => {
  const calls: Array<string> = [];
  const evolu = createEvoluStub(calls);
  const root = createRoot(document.createElement("div"));

  const render = (
    element: ReturnType<typeof createElement>,
    value: Evolu = evolu,
  ): void => {
    act(() => {
      root.render(createElement(EvoluContext, { value }, element));
    });
  };

  return {
    calls,
    render,
    [Symbol.dispose]: () => {
      act(() => {
        root.unmount();
      });
    },
  };
};

// Recreates the owner and transports on every render, as callers usually do.
const Registration: FC<{
  readonly owner: ReadonlyOwner | Owner | null;
  readonly url: string;
}> = ({ owner, url }) => {
  useOwner(owner && { ...owner }, [
    createOwnerWebSocketTransport({ url, ownerId: testAppOwner.id }),
  ]);
  return null;
};

test("registers an equal owner once and releases it on change and unmount", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;

  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: "wss://a.example",
    }),
  );
  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: "wss://a.example",
    }),
  );
  assertEqual(calls, ["use writable wss://a.example"]);

  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: "wss://b.example",
    }),
  );
  assertEqual(calls.splice(0), [
    "use writable wss://a.example",
    "unuse writable wss://a.example",
    "use writable wss://b.example",
  ]);

  // A readonly owner with the same ID is a different registration.
  const { id, encryptionKey } = testAppOwner;
  render(
    createElement(Registration, {
      owner: { id, encryptionKey },
      url: "wss://b.example",
    }),
  );
  assertEqual(calls.splice(0), [
    "unuse writable wss://b.example",
    "use readonly wss://b.example",
  ]);

  render(createElement("div"));
  assertEqual(calls, ["unuse readonly wss://b.example"]);
});

test("moves the registration to another Evolu instance", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;
  const otherCalls: Array<string> = [];
  const element = createElement(Registration, {
    owner: testAppOwner,
    url: "wss://a.example",
  });

  render(element);
  render(element, createEvoluStub(otherCalls));
  assertEqual(calls, [
    "use writable wss://a.example",
    "unuse writable wss://a.example",
  ]);
  assertEqual(otherCalls, ["use writable wss://a.example"]);
});

test("uses no owner while it is null", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;

  render(createElement(Registration, { owner: null, url: "wss://a.example" }));
  assertEqual(calls, []);

  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: "wss://a.example",
    }),
  );
  render(createElement(Registration, { owner: null, url: "wss://a.example" }));
  assertEqual(calls, [
    "use writable wss://a.example",
    "unuse writable wss://a.example",
  ]);
});

test("keeps one registration in StrictMode", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;

  render(
    createElement(
      StrictMode,
      null,
      createElement(Registration, {
        owner: testAppOwner,
        url: "wss://a.example",
      }),
    ),
  );
  // StrictMode renders twice, and React may also run the effect twice with a
  // cleanup in between. Either way, one registration remains.
  const useCount = calls.filter((call) => call.startsWith("use ")).length;
  assertEqual(useCount - (calls.length - useCount), 1);
});

/** An Evolu stub of the database a component shows the sync status of. */
const createEvoluSyncStub = (name: Name): Evolu =>
  // Only name and appOwner are used by useOwnerSyncStatus.
  ({ name, appOwner: testAppOwner }) as Pick<
    Evolu,
    "name" | "appOwner"
  > as Evolu;

const transportId = createId<"SyncTransport">(testCreateDeps());
const shardOwner = deriveShardOwner(testAppOwner, ["shard", 1]);
const otherName = Name.orThrow("Other");

const openConnection: SyncConnection = {
  type: "Open",
  openedAt: Millis.orThrow(1000),
  error: null,
};

const pendingRoute: PendingSyncRoute = {
  type: "Pending",
  transportId,
  failure: null,
  skippedError: null,
  completeAt: null,
  lastSentAt: null,
  lastReceivedAt: null,
};

const completeRoute: CompleteSyncRoute = {
  type: "Complete",
  transportId,
  completeAt: Millis.orThrow(2000),
  lastSentAt: Millis.orThrow(1500),
  lastReceivedAt: Millis.orThrow(2000),
};

/** A snapshot of one relay and one writable owner in each database. */
const createSyncState = (
  connection: SyncConnection,
  owners: ReadonlyArray<{ name: Name; ownerId: OwnerId; route: SyncRoute }>,
): SyncState => ({
  transports: [
    {
      type: "WebSocket",
      id: transportId,
      label: "wss://relay.example",
      connection,
    },
  ],
  tenants: owners.map(({ name, ownerId, route }) => ({
    type: "Active",
    name,
    owners: [{ type: "Writable", ownerId, routes: [route] }],
  })),
});

/** A snapshot of one relay and the app owner in the tested database. */
const createAppOwnerSyncState = (
  connection: SyncConnection,
  route: SyncRoute,
): SyncState =>
  createSyncState(connection, [
    { name: testName, ownerId: testAppOwner.id, route },
  ]);

/**
 * Renders a component that records each status `useOwnerSyncStatus` returns,
 * for the app owner when rendered without an owner.
 */
const setupUseOwnerSyncStatus = () => {
  const syncState = createStore<SyncState | null>(null);
  const statuses: Array<OwnerSyncStatus> = [];
  const root = createRoot(document.createElement("div"));

  const AppOwnerSyncStatus: FC = () => {
    statuses.push(useOwnerSyncStatus(syncState));
    return null;
  };

  const SyncStatus: FC<{ readonly owner: ReadonlyOwner | Owner | null }> = ({
    owner,
  }) => {
    statuses.push(useOwnerSyncStatus(syncState, owner));
    return null;
  };

  const render = (
    owner?: ReadonlyOwner | Owner | null,
    name: Name = testName,
  ): void => {
    act(() => {
      root.render(
        createElement(
          EvoluContext,
          { value: createEvoluSyncStub(name) },
          owner === undefined
            ? createElement(AppOwnerSyncStatus)
            : createElement(SyncStatus, { owner }),
        ),
      );
    });
  };

  const setSyncState = (state: SyncState): void => {
    act(() => {
      syncState.set(state);
    });
  };

  return {
    statuses,
    render,
    setSyncState,
    [Symbol.dispose]: () => {
      act(() => {
        root.unmount();
      });
      syncState[Symbol.dispose]();
    },
  };
};

test("returns NoRelays before the first snapshot and follows the store", () => {
  using setup = setupUseOwnerSyncStatus();
  const { statuses, render, setSyncState } = setup;

  render();
  setSyncState(createAppOwnerSyncState({ type: "Connecting" }, pendingRoute));
  setSyncState(createAppOwnerSyncState(openConnection, completeRoute));
  setSyncState(
    createAppOwnerSyncState(
      {
        type: "Disconnected",
        disconnectedAt: Millis.orThrow(3000),
        openedAt: Millis.orThrow(1000),
        error: null,
      },
      pendingRoute,
    ),
  );

  assertEqual(statuses, [
    { type: "NoRelays" },
    { type: "Syncing" },
    { type: "Synced" },
    { type: "Offline" },
  ]);
});

test("uses the given owner and ignores the same owner in another database", () => {
  using setup = setupUseOwnerSyncStatus();
  const { statuses, render, setSyncState } = setup;

  setSyncState(
    createSyncState(openConnection, [
      { name: testName, ownerId: shardOwner.id, route: pendingRoute },
      { name: otherName, ownerId: testAppOwner.id, route: completeRoute },
    ]),
  );
  render(shardOwner);
  render();
  // The same component under another database's Evolu instance.
  render(undefined, otherName);

  assertEqual(statuses, [
    { type: "Syncing" },
    { type: "NoRelays" },
    { type: "Synced" },
  ]);
});

test("returns NoRelays for a null owner, as for one still loading", () => {
  using setup = setupUseOwnerSyncStatus();
  const { statuses, render, setSyncState } = setup;

  setSyncState(createAppOwnerSyncState(openConnection, completeRoute));
  render(null);
  render(shardOwner);
  setSyncState(
    createSyncState(openConnection, [
      { name: testName, ownerId: shardOwner.id, route: completeRoute },
    ]),
  );

  assertEqual(statuses, [
    { type: "NoRelays" },
    { type: "NoRelays" },
    { type: "Synced" },
  ]);
});

test("rejects an owner that may be undefined", () => {
  using syncState = createStore<SyncState | null>(
    createAppOwnerSyncState(openConnection, completeRoute),
  );
  const statuses: Array<OwnerSyncStatus> = [];
  const SyncStatus: FC<{ readonly owner: Owner | undefined }> = ({ owner }) => {
    // @ts-expect-error No overload takes an owner that may be undefined, which would mean the app owner; pass null while there is none.
    statuses.push(useOwnerSyncStatus(syncState, owner));
    return null;
  };
  const root = createRoot(document.createElement("div"));
  act(() => {
    root.render(
      createElement(
        EvoluContext,
        { value: createEvoluSyncStub(testName) },
        createElement(SyncStatus, { owner: undefined }),
      ),
    );
  });
  act(() => {
    root.unmount();
  });

  // The app owner's status, which the type keeps a loading owner from getting.
  assertEqual(statuses, [{ type: "Synced" }]);
});

test("re-renders only when the status changes", () => {
  using setup = setupUseOwnerSyncStatus();
  const { statuses, render, setSyncState } = setup;

  render();
  setSyncState(createAppOwnerSyncState(openConnection, completeRoute));
  // The worker publishes a new snapshot for every frame, each a new object.
  setSyncState(
    createAppOwnerSyncState(openConnection, {
      ...completeRoute,
      lastSentAt: Millis.orThrow(2500),
    }),
  );
  assertEqual(statuses, [{ type: "NoRelays" }, { type: "Synced" }]);

  const quotaError = {
    type: "ProtocolQuotaError",
    ownerId: testAppOwner.id,
    at: Millis.orThrow(3000),
  } as const;
  setSyncState(
    createAppOwnerSyncState(openConnection, {
      ...pendingRoute,
      failure: quotaError,
    }),
  );
  const errorStatus = statuses.at(-1);
  assertEqual(errorStatus, { type: "Error", error: quotaError });

  // The store keeps an unchanged error's object between snapshots.
  setSyncState(
    createAppOwnerSyncState(openConnection, {
      ...pendingRoute,
      failure: quotaError,
      lastSentAt: Millis.orThrow(3500),
    }),
  );
  assertEqual(statuses.length, 3);

  // A render for another reason returns the same Error object.
  render();
  assertEqual(statuses.length, 4);
  assertSame(statuses.at(-1), errorStatus);
});

/**
 * Hydrates a component that renders the app owner's status type over what
 * server rendering produced, where the store has no snapshot.
 */
const setupHydratedSyncStatus = (initialState: SyncState | null) => {
  const syncState = createStore<SyncState | null>(initialState);
  const statuses: Array<OwnerSyncStatus["type"]> = [];
  const SyncStatus: FC = () => {
    const { type } = useOwnerSyncStatus(syncState);
    statuses.push(type);
    return type;
  };
  const container = document.createElement("div");
  container.textContent = "NoRelays";

  let root: Root | undefined;
  act(() => {
    root = hydrateRoot(
      container,
      createElement(
        EvoluContext,
        { value: createEvoluSyncStub(testName) },
        createElement(SyncStatus),
      ),
    );
  });

  return {
    statuses,
    container,
    [Symbol.dispose]: () => {
      act(() => {
        root?.unmount();
      });
      syncState[Symbol.dispose]();
    },
  };
};

test("returns NoRelays while hydrating, then the store's status", () => {
  using setup = setupHydratedSyncStatus(
    createAppOwnerSyncState(openConnection, completeRoute),
  );

  assertEqual(setup.statuses, ["NoRelays", "Synced"]);
  assertEqual(setup.container.textContent, "Synced");
});

test("hydrates before the first snapshot without rendering again", () => {
  using setup = setupHydratedSyncStatus(null);

  // The client starts from the same NoRelays object as the server.
  assertEqual(setup.statuses, ["NoRelays"]);
  assertEqual(setup.container.textContent, "NoRelays");
});
