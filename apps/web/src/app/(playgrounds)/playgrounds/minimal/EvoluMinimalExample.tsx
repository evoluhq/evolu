"use client";

import {
  AppName,
  booleanToSqliteBoolean,
  constNull,
  createEvoluApp,
  createObjectURL,
  createOwnerSecret,
  createQueryBuilder,
  id,
  Mnemonic,
  mnemonicToOwnerSecret,
  NonEmptyTrimmedString100,
  nullOr,
  ownerSecretToOwnerId,
  SqliteBoolean,
  sqliteTrue,
  WebSocketUrlFromString,
  type EvoluDisposedError,
  type KyselyNotNull,
  type OwnerSecret,
  type UnknownError,
} from "@evolu/common";
import { createEvoluBinding } from "@evolu/react";
import { createEvoluDeps } from "@evolu/react-web";
import { createRun } from "@evolu/web";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import { clsx } from "clsx";
import {
  Component,
  Suspense,
  use,
  useState,
  useSyncExternalStore,
  type FC,
  type ReactNode,
} from "react";

// Any Standard Schema library can be used.
const AppSchema = {
  todo: {
    // Primary keys are branded types, preventing accidental use of IDs across
    // different tables (e.g., a TodoId can't be used where a UserId is expected).
    id: id("Todo"),
    // Branded type ensuring titles are non-empty and ≤100 chars.
    title: NonEmptyTrimmedString100,
    // SQLite doesn't support the boolean type; it uses 0 and 1 instead.
    isCompleted: nullOr(SqliteBoolean),
  },
};

const createAppQuery = createQueryBuilder(AppSchema);

const todosQuery = createAppQuery((db) =>
  db
    // Type-safe SQL: try autocomplete for table and column names.
    .selectFrom("todo")
    .select(["id", "title", "isCompleted"])

    // Soft delete: filter out deleted rows.
    .where("isDeleted", "is not", sqliteTrue)

    // Like with GraphQL, all columns except id are nullable in queries
    // (even if defined without nullOr in the schema) to allow schema
    // evolution without migrations. Filter nulls with where + $narrowType.
    .where("title", "is not", null)
    .$narrowType<{ title: KyselyNotNull }>()

    // Columns createdAt, updatedAt, isDeleted are auto-added to all tables.
    .orderBy("createdAt"),
);

// Extract the row type from the query for type-safe component props.
type TodosRow = typeof todosQuery.Row;

// Create Run with dependencies for React Web.
const run = createRun(createEvoluDeps());

const {
  EvoluAppProvider,
  useEvolu,
  useAppOwners,
  useEvoluApp,
  useOwnerSyncStatus,
  useQuery,
} = createEvoluBinding<typeof AppSchema>();

export const EvoluMinimalExample: FC = () => {
  // `evoluError` is shared by all Evolu instances created from these deps.
  const error = useSyncExternalStore(
    run.deps.evoluError.subscribe,
    run.deps.evoluError.get,
    constNull,
  );

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <div className="mb-2 flex items-center justify-between pb-4">
          <h1 className="w-full text-center text-xl font-semibold text-gray-900">
            Minimal Todo App
          </h1>
        </div>

        <p className="mb-6 border-l-2 border-amber-400 pl-4 text-sm text-gray-600">
          The smallest Evolu app: it starts at once with one account, with no
          passkey and no switching between accounts. Without a passkey, its data
          on this device isn&apos;t protected against malware, so it
          doesn&apos;t suit sensitive data.
        </p>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800"
          >
            Evolu error: {error.type}. See the console for details.
          </p>
        )}

        {/* A failed start, such as of a refused database, shows here instead of
            unmounting the page. */}
        <ErrorBoundary
          fallback={
            <p role="alert" className="text-sm text-red-800">
              The app couldn&apos;t start. See the console for details.
            </p>
          }
        >
          <Suspense>
            {/*
              Suspense delivers great UX (no loading flickers) and DX (no
              loading states to manage). Highly recommended with Evolu.
            */}
            <App />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
};

const appPromise = run.orThrow(
  createEvoluApp(AppSchema, {
    appName: AppName.orThrow("minimal-example"),
    auth: { type: "InstantStart" },
    // The first start creates the account and opens it.
    createFirstAppOwner: true,

    transports: [
      {
        type: "WebSocket",
        url: WebSocketUrlFromString.orThrow(
          process.env.NEXT_PUBLIC_EVOLU_RELAY_URL ??
            (process.env.NODE_ENV === "development"
              ? "ws://localhost:4000"
              : "wss://free.evoluhq.com"),
        ),
      },
    ],
  }),
);

const App: FC = () => (
  <EvoluAppProvider value={appPromise} withoutAppOwner={<WithoutAppOwner />}>
    <SyncStatus />
    {/* The todos load in their own boundary, so the status line's live region
        is already mounted when the first status arrives. A query SQLite
        fails, such as on a corrupt page, shows its message here. */}
    <ErrorBoundary
      fallback={
        <p role="alert" className="mb-4 text-sm text-red-800">
          This account&apos;s data couldn&apos;t load. See the console for
          details.
        </p>
      }
    >
      <Suspense>
        <DevicePersistenceNotice />
        <Todos />
      </Suspense>
    </ErrorBoundary>
    {/* Outside the data's boundaries, so the user can still back up, restore,
        or delete the account while a refused database keeps its queries
        pending, or after a query failed. */}
    <OwnerActions />
  </EvoluAppProvider>
);

/**
 * Renders `fallback` instead of its children once one of them throws, which
 * React logs, rather than unmounting the page. React has no hook for an error
 * boundary, so it's a class.
 */
class ErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Shown when no account is open, such as after Delete Account. The app keeps
 * one account, so an account another tab added is offered to open instead.
 */
const WithoutAppOwner: FC = () => {
  const app = useEvoluApp();
  const appOwners = useAppOwners();

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <p className="mb-4 text-sm text-gray-600">No account is open.</p>
      {appOwners.length > 0 ? (
        <Button
          title="Open Account"
          variant="primary"
          onClick={() => {
            app.open(appOwners[0].id);
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            title="Create Account"
            variant="primary"
            onClick={() => {
              void app.add(createOwnerSecret(run.deps)).then((added) => {
                if (!added.ok) alert("Creating the account failed. Try again.");
              });
            }}
          />
          <Button
            title="Restore Account"
            onClick={() => {
              const secret = promptMnemonic();
              if (!secret) return;
              void app.add(secret).then((added) => {
                if (!added.ok)
                  alert("Restoring the account failed. Try again.");
              });
            }}
          />
        </div>
      )}
    </div>
  );
};

/** Asks for a mnemonic and returns its secret, or null when it's cancelled. */
const promptMnemonic = (): OwnerSecret | null => {
  const value = window.prompt("Enter your mnemonic to restore your data:");
  if (value == null) return null;
  // Mnemonic accepts one spelling only, as its JSDoc says.
  const mnemonic = Mnemonic.fromUnknown(
    value.normalize("NFKD").trim().split(/\s+/u).join(" "),
  );
  if (!mnemonic.ok) {
    alert(Mnemonic.formatError(mnemonic.error));
    return null;
  }
  return mnemonicToOwnerSecret(mnemonic.value);
};

/**
 * Tells the user when this device doesn't keep their data, and shows nothing
 * otherwise. That happens where the browser offers no persistent storage, as in
 * Safari's Private Browsing or a Firefox private window. See
 * `DevicePersistence` in `@evolu/common/local-first`.
 */
const DevicePersistenceNotice: FC = () => {
  const devicePersistence = use(useEvolu().devicePersistence);
  if (devicePersistence !== "NotPersisted") return null;
  return (
    <p className="mb-4 text-sm text-gray-600">
      Your data isn&apos;t kept on this device. Changes that haven&apos;t synced
      are lost when you close this tab.
    </p>
  );
};

/**
 * Tells the user when changes can't leave this device, and shows nothing while
 * sync works. See `OwnerSyncStatus` in `@evolu/common/local-first`.
 */
const SyncStatus: FC = () => {
  // Sync state is shared by every Evolu instance created from these deps, so
  // the hook takes its store and finds this database's app owner in it.
  const status = useOwnerSyncStatus(run.deps.syncState);
  // An app that sells relay quota offers more for a ProtocolQuotaError, then
  // calls `evolu.requestSync(evolu.appOwner.id)`.
  const message =
    status.type === "Disconnected"
      ? "Can't reach the sync server. Changes will sync once the connection is back."
      : status.type === "Error"
        ? status.error.type === "ProtocolQuotaError"
          ? "Sync is paused because the sync server is full."
          : `Sync error: ${status.error.type}.`
        : null;

  return (
    // Always mounted: screen readers announce changes only in a live region
    // that already exists.
    <div role="status">
      {message && <p className="mb-4 text-sm text-gray-600">{message}</p>}
    </div>
  );
};

const Todos: FC = () => {
  // useQuery returns live data - component re-renders when data changes.
  const todos = useQuery(todosQuery);

  const { insert } = useEvolu();
  const [newTodoTitle, setNewTodoTitle] = useState("");

  const addTodo = () => {
    const result = parseTodoTitle(newTodoTitle);
    if (!result.ok) {
      alert(NonEmptyTrimmedString100.formatError(result.error));
      return;
    }

    insert(
      "todo",
      {
        title: result.value,
      },
      {
        onSuccess: () => {
          setNewTodoTitle("");
        },
      },
    );
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <ol className="mb-6 space-y-2">
        {todos.map((todo) => (
          <TodoItem key={todo.id} row={todo} />
        ))}
      </ol>

      <div className="flex gap-2">
        <input
          type="text"
          value={newTodoTitle}
          onChange={(e) => {
            setNewTodoTitle(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTodo();
          }}
          placeholder="Add a new todo..."
          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 sm:text-sm/6"
        />
        <Button title="Add" onClick={addTodo} variant="primary" />
      </div>
    </div>
  );
};

const TodoItem: FC<{
  row: TodosRow;
}> = ({ row: { id: todoId, title, isCompleted } }) => {
  const { update } = useEvolu();

  const handleToggleCompletedClick = () => {
    update("todo", {
      id: todoId,
      isCompleted: booleanToSqliteBoolean(!isCompleted),
    });
  };

  const handleRenameClick = () => {
    const newTitle = window.prompt("Edit todo", title);
    if (newTitle == null) return;

    const result = parseTodoTitle(newTitle);
    if (!result.ok) {
      alert(NonEmptyTrimmedString100.formatError(result.error));
      return;
    }

    update("todo", { id: todoId, title: result.value });
  };

  const handleDeleteClick = () => {
    update("todo", {
      id: todoId,
      // Soft delete with isDeleted flag (CRDT-friendly, preserves sync history).
      isDeleted: sqliteTrue,
    });
  };

  return (
    <li className="-mx-2 flex items-center gap-3 px-2 py-2 hover:bg-gray-50">
      <label className="flex flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={!!isCompleted}
          onChange={handleToggleCompletedClick}
          className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-blue-600 checked:bg-blue-600 indeterminate:border-blue-600 indeterminate:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"
        />
        <span
          className={clsx(
            "flex-1 text-sm",
            isCompleted ? "text-gray-500 line-through" : "text-gray-900",
          )}
        >
          {title}
        </span>
      </label>
      <div className="flex gap-1">
        <button
          onClick={handleRenameClick}
          className="p-1 text-gray-400 transition-colors hover:text-blue-600"
          title="Edit"
        >
          <IconEdit className="size-4" />
        </button>
        <button
          onClick={handleDeleteClick}
          className="p-1 text-gray-400 transition-colors hover:text-red-600"
          title="Delete"
        >
          <IconTrash className="size-4" />
        </button>
      </div>
    </li>
  );
};

/** Trims user input and validates it as a todo title. */
const parseTodoTitle = (value: string) =>
  NonEmptyTrimmedString100.fromUnknown(value.trim());

const OwnerActions: FC = () => {
  const app = useEvoluApp();
  // The instance of the account the app has open, as app.current holds it.
  const evolu = useEvolu();

  const [showMnemonic, setShowMnemonic] = useState(false);

  // The restored account replaces this one. It's added before this one is
  // removed, so a crash between the two leaves two accounts, not none. Adding
  // opens it.
  const handleRestoreClick = async () => {
    const secret = promptMnemonic();
    if (!secret) return;
    // Replacing removes the open account, so it asks first, as Delete Account
    // does.
    if (
      ownerSecretToOwnerId(secret) !== evolu.appOwner.id &&
      !confirm(
        "Replace this account? It's removed from this device, and only its mnemonic brings back what synced.",
      )
    )
      return;
    const added = await app.add(secret);
    if (!added.ok) {
      alert("Adding the account failed. Try again.");
      return;
    }
    // Restoring the open account's own mnemonic leaves nothing to remove.
    if (added.value === evolu.appOwner.id) return;
    const removed = await app.remove(evolu.appOwner.id);
    if (!removed.ok) alert("Removing the previous account failed.");
  };

  const handleDeleteClick = () => {
    if (
      !confirm(
        "Delete this account? It's removed from this device, and only its mnemonic brings back what synced.",
      )
    )
      return;
    void app.remove(evolu.appOwner.id).then((removed) => {
      if (!removed.ok) alert("Deleting the account failed. Try again.");
    });
  };

  const handleDownloadDatabaseClick = () => {
    void evolu
      .exportDatabase()
      .then((data: Uint8Array<ArrayBuffer>) => {
        using objectUrl = createObjectURL(
          new Blob([data], { type: "application/x-sqlite3" }),
        );
        const link = document.createElement("a");
        link.href = objectUrl.url;
        link.download = `${evolu.name}.sqlite3`;
        link.click();
      })
      .catch((error: EvoluDisposedError | UnknownError) => {
        // A deletion or removal disposed the instance first.
        if (error.type === "EvoluDisposedError") return;
        alert("Downloading the data failed. Try again.");
      });
  };

  return (
    <div className="mt-8 rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-4 text-lg font-medium text-gray-900">Account</h2>
      <p className="mb-4 text-sm text-gray-600">
        Todos are stored in local SQLite. When you sync across devices, your
        data is end-to-end encrypted using your mnemonic.
      </p>

      <div className="space-y-3">
        <Button
          title={`${showMnemonic ? "Hide" : "Show"} Mnemonic`}
          onClick={() => {
            setShowMnemonic(!showMnemonic);
          }}
          className="w-full"
        />

        {showMnemonic && (
          <div className="bg-gray-50 p-3">
            <label className="mb-2 block text-xs font-medium text-gray-700">
              Your Mnemonic (keep this safe!)
            </label>
            <textarea
              value={evolu.appOwner.mnemonic}
              readOnly
              rows={3}
              className="w-full border-b border-gray-300 bg-white px-2 py-1 font-mono text-xs focus:outline-none"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            title="Restore Account"
            onClick={() => {
              void handleRestoreClick();
            }}
          />
          <Button title="Delete Account" onClick={handleDeleteClick} />
          <Button title="Download Data" onClick={handleDownloadDatabaseClick} />
        </div>
      </div>
    </div>
  );
};

const Button: FC<{
  title: string;
  className?: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}> = ({ title, className, onClick, variant = "secondary" }) => {
  const baseClasses =
    "px-3 py-2 text-sm font-medium rounded-lg transition-colors";
  const variantClasses =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "bg-gray-100 text-gray-700 hover:bg-gray-200";

  return (
    <button
      className={clsx(baseClasses, variantClasses, className)}
      onClick={onClick}
    >
      {title}
    </button>
  );
};
