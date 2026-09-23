"use client";

import {
  AppName,
  booleanToSqliteBoolean,
  brand,
  constNull,
  createEvolu,
  createOwnerWebSocketTransport,
  createQueryBuilder,
  err,
  id,
  NonEmptyTrimmedString100,
  nullOr,
  ok,
  SqliteBoolean,
  sqliteTrue,
  String,
  testAppOwner,
  trySync,
  type KyselyNotNull,
  type Millis,
} from "@evolu/common";
import {
  syncStateToOwnerSyncStates,
  type OwnerSyncStatus,
  type RelaySyncState,
  type SyncRouteError,
} from "@evolu/common/local-first";
import { createEvoluBinding } from "@evolu/react";
import { createEvoluDeps } from "@evolu/react-web";
import { createRun } from "@evolu/web";
import { clsx } from "clsx";
import { Suspense, use, useState, useSyncExternalStore, type FC } from "react";

const AppSchema = {
  todo: {
    id: id("Todo"),
    title: NonEmptyTrimmedString100,
    isCompleted: nullOr(SqliteBoolean),
  },
};

const itemsQuery = createQueryBuilder(AppSchema)((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("title", "is not", null)
    .$narrowType<{ title: KyselyNotNull }>()
    .orderBy("createdAt"),
);

const run = createRun(createEvoluDeps());
const { EvoluContext, useEvolu, useOwner, useQuery } =
  createEvoluBinding<typeof AppSchema>();

const RelayUrl = brand(
  "RelayUrl",
  String,
  (value) => {
    const result = trySync(() => new URL(value));
    return result.ok &&
      (result.value.protocol === "ws:" || result.value.protocol === "wss:") &&
      result.value.hostname !== "" &&
      result.value.username === "" &&
      result.value.password === "" &&
      !value.includes("?") &&
      !value.includes("#")
      ? ok()
      : err({ type: "RelayUrl", value });
  },
  () =>
    "Use a ws:// or wss:// relay URL without credentials, a query, or a fragment.",
);

const defaultRelayUrl = new URL(
  RelayUrl.orThrow(
    process.env.NEXT_PUBLIC_EVOLU_RELAY_URL ??
      (process.env.NODE_ENV === "development"
        ? "ws://localhost:4000"
        : "wss://free.evoluhq.com"),
  ),
).href;

const appPromise = run.ok(
  createEvolu(AppSchema, {
    appName: AppName.orThrow("sync-playground"),
    appOwner: testAppOwner,
    // Only local persistence changes. Synchronization still uses a real relay.
    memoryOnly: true,
    // The UI owns each relay registration, including the default one.
    transports: [],
  }),
);

export const EvoluSyncExample: FC = () => {
  const error = useSyncExternalStore(
    run.deps.evoluError.subscribe,
    run.deps.evoluError.get,
    constNull,
  );

  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-900 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <a
          href="/docs/playgrounds"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
        >
          ← Playgrounds
        </a>
        <header className="mt-8 mb-8">
          <p className="mb-3 text-xs font-semibold tracking-widest text-teal-700 uppercase">
            In-memory SQLite
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Sync playground
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
            Keep syncing when a relay goes down. Combine a home or company relay
            with an independent remote backup. Evolu sends encrypted changes to
            both; a relay that reconnects catches up automatically.
          </p>
          <p className="mt-3 text-sm text-zinc-600">
            Choose a geographically separate second relay, such as a paid
            hosting service.{" "}
            <a
              href="/docs/relay"
              className="font-medium text-teal-700 underline underline-offset-4"
            >
              Read about relay redundancy
            </a>
            .
          </p>
        </header>

        {/* Keep startup errors visible even when a query cannot finish. */}
        {error && (
          <p
            role="alert"
            className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-800"
          >
            Last reported application error: {error.type}
          </p>
        )}

        <Suspense fallback={<p role="status">Opening database…</p>}>
          <App />
        </Suspense>

        <div className="mt-8 grid gap-6 text-sm leading-6 text-zinc-600 sm:grid-cols-2">
          <div>
            <h2 className="font-medium text-zinc-900">Try losing one relay</h2>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>
                Add a second relay you control and wait for both to be up to
                date.
              </li>
              <li>
                Stop one relay and edit the list. The other keeps synchronizing.
              </li>
              <li>
                Restart the stopped relay and watch it catch up automatically.
              </li>
            </ol>
            <p className="mt-3">
              Open another browser or private window to see changes arrive
              through the relay. Keep this page open during the experiment: its
              database lives in memory.
            </p>
          </div>
          <div>
            <h2 className="font-medium text-zinc-900">A shared demo</h2>
            <p className="mt-1">
              Everyone using the test owner on the same relay shares this list,
              including the minimal and full playgrounds. Use sample data.
              Closing the database clears its local contents; synchronized items
              remain on the relay and return when you connect again.
            </p>
            <p className="mt-3">
              The free Evolu relay is for testing and may delete data. For
              durable backups, use independently operated relays with
              appropriate retention.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
};

const App: FC = () => (
  <EvoluContext value={use(appPromise)}>
    <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
      <section
        aria-labelledby="items-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-6"
      >
        <h2 id="items-heading" className="text-lg font-semibold">
          Shared list
        </h2>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Changes are saved locally first.
        </p>
        <Suspense fallback={<p role="status">Loading items…</p>}>
          <Items />
        </Suspense>
      </section>
      <SyncStatus />
    </div>
  </EvoluContext>
);

const Items: FC = () => {
  const items = useQuery(itemsQuery);
  const { insert, update } = useEvolu();
  const [title, setTitle] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const result = NonEmptyTrimmedString100.fromUnknown(title.trim());
          if (!result.ok) {
            setValidationError("Enter an item with 1–100 characters.");
            return;
          }
          setValidationError(null);
          insert(
            "todo",
            { title: result.value },
            {
              onComplete: () => {
                setTitle((current) => (current === title ? "" : current));
              },
            },
          );
        }}
      >
        <label htmlFor="new-item" className="sr-only">
          New item
        </label>
        <div className="flex gap-2">
          <input
            id="new-item"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Something to sync…"
            autoComplete="off"
            aria-invalid={validationError !== null}
            aria-describedby={validationError ? "item-error" : undefined}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-teal-600"
          />
          <button
            type="submit"
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Add
          </button>
        </div>
        {validationError && (
          <p id="item-error" role="alert" className="mt-2 text-sm text-red-700">
            {validationError}
          </p>
        )}
      </form>

      <ul aria-label="Items" className="mt-5 divide-y divide-zinc-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-3">
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <input
                type="checkbox"
                checked={!!item.isCompleted}
                onChange={() => {
                  update("todo", {
                    id: item.id,
                    isCompleted: booleanToSqliteBoolean(!item.isCompleted),
                  });
                }}
                className="size-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-600"
              />
              <span
                className={clsx(
                  "text-sm wrap-break-word",
                  item.isCompleted && "text-zinc-400 line-through",
                )}
              >
                {item.title}
              </span>
            </label>
            <button
              type="button"
              aria-label={`Delete ${item.title}`}
              onClick={() => {
                update("todo", { id: item.id, isDeleted: sqliteTrue });
              }}
              className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-red-700"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          Add an item to get started.
        </p>
      )}
    </>
  );
};

const syncLabels: Readonly<Record<OwnerSyncStatus, string>> = {
  initial: "Starting",
  syncing: "Syncing",
  synced: "Synced",
  offline: "Offline",
  error: "Sync error",
};

const syncDescriptions: Readonly<Record<OwnerSyncStatus, string>> = {
  initial: "Waiting for the first synchronization round.",
  syncing: "Reconciling this database with its connected relays.",
  synced: "Up to date with the connected relays.",
  offline: "No relay is connected. You can keep editing locally.",
  error: "A synchronization request failed. See the relay details below.",
};

const SyncStatus: FC = () => {
  const evolu = useEvolu();
  const [relayUrls, setRelayUrls] = useState<ReadonlyArray<string>>([
    defaultRelayUrl,
  ]);
  const [relayUrl, setRelayUrl] = useState("");
  const [relayError, setRelayError] = useState<string | null>(null);
  // Subscribe to the cached snapshot; derive display values after reading it.
  const snapshot = useSyncExternalStore(
    run.deps.syncState.subscribe,
    run.deps.syncState.get,
    constNull,
  );
  const tenant = snapshot?.tenants.find(({ name }) => name === evolu.name);
  const state =
    snapshot &&
    syncStateToOwnerSyncStates(snapshot).find(
      ({ name, ownerId }) =>
        name === evolu.name && ownerId === evolu.appOwner.id,
    );
  const status = state?.status ?? "initial";
  // Databases can spell one relay differently, such as without a trailing
  // slash, and each spelling gets its own connection. Show one per relay,
  // combining the state of its connections. Remove with evoluhq/evolu#710.
  const relaysByUrl = new Map<
    string,
    {
      relay: RelaySyncState;
      isConnected: boolean;
      isComplete: boolean;
      error: SyncRouteError | null;
    }
  >();
  for (const relay of state?.relays ?? []) {
    const { transport, route } = relay;
    const parsed = trySync(() => new URL(transport.label));
    const url = parsed.ok ? parsed.value.href : transport.label;
    const other = relaysByUrl.get(url);
    const error =
      route.error && (!other?.error || route.error.at > other.error.at)
        ? route.error
        : (other?.error ?? null);
    relaysByUrl.set(url, {
      // Details show this page's connection when another database shares it.
      relay: other && transport.label !== url ? other.relay : relay,
      isConnected: transport.readyState === "open" || !!other?.isConnected,
      isComplete: relay.status === "synced" || !!other?.isComplete,
      error,
    });
  }
  const relays = [...relaysByUrl];
  const connectedCount = relays.filter(
    ([, { isConnected }]) => isConnected,
  ).length;
  const completeCount = relays.filter(
    ([, { isComplete }]) => isComplete,
  ).length;
  const configuredCount = new Set([...relayUrls, ...relaysByUrl.keys()]).size;
  const isLocalOnly = configuredCount === 0;
  const relaysNoun = configuredCount === 1 ? "relay" : "relays";
  // Listed until the worker reports the relay, so it can always be removed.
  const pendingRelayUrls = relayUrls.filter((url) => !relaysByUrl.has(url));

  const removeRelayButton = (url: string) => (
    <button
      type="button"
      aria-label={`Remove ${url}`}
      onClick={() =>
        setRelayUrls((urls) => urls.filter((relayUrl) => relayUrl !== url))
      }
      className="mt-3 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-red-700"
    >
      Remove
    </button>
  );

  return (
    <section
      aria-labelledby="sync-heading"
      className="rounded-2xl border border-zinc-200 bg-white p-6"
    >
      {relayUrls.map((url) => (
        <RelayRegistration key={url} url={url} />
      ))}
      <div className="flex items-center justify-between gap-3">
        <h2 id="sync-heading" className="text-lg font-semibold">
          Synchronization
        </h2>
        <span role="status">
          <StatusBadge
            tone={
              tenant?.refused
                ? "error"
                : isLocalOnly
                  ? "neutral"
                  : status === "error"
                    ? "error"
                    : status === "synced"
                      ? "success"
                      : status === "offline"
                        ? "neutral"
                        : "progress"
            }
          >
            {tenant?.refused
              ? "Database unavailable"
              : isLocalOnly
                ? "Local only"
                : syncLabels[status]}
          </StatusBadge>
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600">
        {tenant?.refused
          ? "This database could not start."
          : isLocalOnly
            ? "Add a relay to synchronize this in-memory database."
            : syncDescriptions[status]}
      </p>
      <div className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm">
        <p className="font-medium">
          {connectedCount} of {configuredCount} {relaysNoun} connected
        </p>
        <p className="mt-1 text-zinc-600">
          {completeCount} of {configuredCount} {relaysNoun} up to date
        </p>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          {configuredCount === 0
            ? "Add a relay to keep a copy of your data outside this page."
            : configuredCount === 1
              ? "Add an independent second relay for another copy of your data."
              : completeCount === configuredCount
                ? "Each relay has caught up. Either can serve your data if the other becomes unavailable."
                : connectedCount > 0
                  ? "Connected relays keep synchronizing. Unavailable relays catch up when they reconnect."
                  : "Keep this page open. Your changes wait in memory until a relay reconnects."}
        </p>
      </div>
      <dl className="mt-4 flex justify-between gap-3 text-sm">
        <dt className="text-zinc-500">Last successful sync</dt>
        <dd>
          <Timestamp value={state?.syncedAt ?? null} />
        </dd>
      </dl>

      <section
        aria-labelledby="relays-heading"
        className="mt-6 border-t border-zinc-100 pt-5"
      >
        <h3 id="relays-heading" className="mb-3 text-sm font-semibold">
          Relays
        </h3>
        <ul className="space-y-4">
          {relays.map(
            ([
              url,
              {
                relay: { transport, route },
                isConnected,
                isComplete,
                error,
              },
            ]) => (
              <li key={url} className="rounded-xl bg-zinc-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-xs break-all text-zinc-600">
                    {url}
                  </span>
                  <StatusBadge tone={isConnected ? "success" : "neutral"}>
                    {isConnected
                      ? "Connected"
                      : transport.readyState === "connecting"
                        ? "Connecting"
                        : transport.readyState === "closing"
                          ? "Disconnecting"
                          : "Disconnected"}
                  </StatusBadge>
                </div>
                <p className="mt-3 text-sm">
                  {error
                    ? `Sync failed: ${error.type}`
                    : isComplete
                      ? "Up to date"
                      : isConnected
                        ? "Reconciling changes…"
                        : "Waiting for a connection"}
                </p>
                <details className="mt-3 text-xs text-zinc-500">
                  <summary className="cursor-pointer hover:text-zinc-900">
                    Connection and sync details
                  </summary>
                  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2">
                    <dt>Last connected</dt>
                    <dd>
                      <Timestamp value={transport.openedAt} />
                    </dd>
                    <dt>Last disconnected</dt>
                    <dd>
                      <Timestamp value={transport.closedAt} />
                    </dd>
                    <dt>Last request</dt>
                    <dd>
                      <Timestamp value={route.lastSentAt} />
                    </dd>
                    <dt>Last processed message</dt>
                    <dd>
                      <Timestamp value={route.lastReceivedAt} />
                    </dd>
                  </dl>
                  {transport.error && (
                    <p className="mt-3 wrap-break-word">
                      Last connection error: {transport.error.type} at{" "}
                      <Timestamp value={transport.error.at} />. This history is
                      retained after reconnecting.
                    </p>
                  )}
                </details>
                {relayUrls.includes(url) ? (
                  removeRelayButton(url)
                ) : (
                  <p className="mt-3 text-xs text-zinc-500">
                    Used by another tab or playground.
                  </p>
                )}
              </li>
            ),
          )}
          {pendingRelayUrls.map((url) => (
            <li key={url} className="rounded-xl bg-zinc-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-xs break-all text-zinc-600">
                  {url}
                </span>
                <StatusBadge tone="neutral">Starting</StatusBadge>
              </div>
              <p className="mt-3 text-sm">Waiting for relay state…</p>
              {removeRelayButton(url)}
            </li>
          ))}
        </ul>
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            const result = RelayUrl.fromUnknown(relayUrl.trim());
            if (!result.ok) {
              setRelayError(RelayUrl.formatError(result.error));
              return;
            }
            // URL normalization makes equivalent host/port spellings one relay.
            const url = new URL(result.value).href;
            // Browsers block ws:// from an HTTPS page except to this device.
            const { protocol, hostname } = new URL(url);
            const isLoopback =
              hostname === "localhost" ||
              hostname.endsWith(".localhost") ||
              hostname === "[::1]" ||
              /^127(\.\d{1,3}){3}$/u.test(hostname);
            if (
              window.location.protocol === "https:" &&
              protocol !== "wss:" &&
              !isLoopback
            ) {
              setRelayError(
                "Use wss:// when this playground is opened over HTTPS, except for a relay on this device.",
              );
              return;
            }
            if (relayUrls.includes(url)) {
              setRelayError("This relay is already added.");
              return;
            }
            setRelayUrls((urls) => [...urls, url]);
            setRelayUrl("");
            setRelayError(null);
          }}
        >
          <label htmlFor="relay-url" className="text-sm font-medium">
            Relay URL
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="relay-url"
              type="text"
              inputMode="url"
              autoComplete="url"
              value={relayUrl}
              onChange={(event) => setRelayUrl(event.target.value)}
              placeholder="wss://your-backup-relay.example"
              aria-invalid={relayError !== null}
              aria-describedby={relayError ? "relay-error" : undefined}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-teal-600"
            />
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              Add relay
            </button>
          </div>
          {relayError && (
            <p
              id="relay-error"
              role="alert"
              className="mt-2 text-sm text-red-700"
            >
              {relayError}
            </p>
          )}
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            Relay choices last for this page session. Removing a relay releases
            this page&apos;s connection; it does not delete its stored data or
            disconnect other tabs.
          </p>
        </form>
      </section>
    </section>
  );
};

// Each keyed component owns one registration. Changing one relay leaves the
// others connected.
const RelayRegistration: FC<{ url: string }> = ({ url }) => {
  const { appOwner } = useEvolu();
  useOwner(appOwner, [
    createOwnerWebSocketTransport({ url, ownerId: appOwner.id }),
  ]);
  return null;
};

const StatusBadge: FC<{
  tone: "success" | "progress" | "neutral" | "error";
  children: React.ReactNode;
}> = ({ tone, children }) => (
  <span
    className={clsx(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
      {
        "bg-teal-50 text-teal-800": tone === "success",
        "bg-blue-50 text-blue-800": tone === "progress",
        "bg-zinc-100 text-zinc-600": tone === "neutral",
        "bg-red-50 text-red-800": tone === "error",
      },
    )}
  >
    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
    {children}
  </span>
);

const Timestamp: FC<{ value: Millis | null }> = ({ value }) =>
  value === null ? (
    <>Not yet</>
  ) : (
    <time
      dateTime={new Date(value).toISOString()}
      title={new Date(value).toLocaleString()}
    >
      {new Date(value).toLocaleTimeString()}
    </time>
  );
