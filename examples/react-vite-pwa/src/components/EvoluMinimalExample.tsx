import * as Evolu from "@evolu/common";
import { createUseEvolu, EvoluProvider, useQuery } from "@evolu/react";
import { evoluReactWebDeps, EvoluIdenticon, localAuth } from "@evolu/react-web";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import clsx from "clsx";
import { FC, Suspense, use, useMemo, useState } from "react";

// Namespace for the current app (scopes databases, passkeys, etc.)
const service = "pwa-react";

// Primary keys are branded types, preventing accidental use of IDs across
// different tables (e.g., a TodoId can't be used where a UserId is expected).
const TodoId = Evolu.id("Todo");
type TodoId = typeof TodoId.Type;

// Schema defines database structure with runtime validation.
// Column types validate data on insert/update/upsert.
const Schema = {
  todo: {
    id: TodoId,
    // Branded type ensuring titles are non-empty and ≤100 chars.
    title: Evolu.NonEmptyString100,
    // SQLite doesn't support the boolean type; it uses 0 and 1 instead.
    isCompleted: Evolu.nullOr(Evolu.SqliteBoolean),
  },
};

// Note: this is a top-level await and used for brevity in the demo
// In a real application, you would use a wrapper component.
const ownerIds = await localAuth.getProfiles({ service });
const authResult = await localAuth.getOwner({ service });

// Create Evolu instance for the React web platform.
const evolu = Evolu.createEvolu(evoluReactWebDeps)(Schema, {
  name: Evolu.SimpleName.orThrow(
    `${service}-${authResult?.owner?.id ?? "guest"}`,
  ),
  reloadUrl: "/",
  encryptionKey: authResult?.owner?.encryptionKey,
  externalAppOwner: authResult?.owner,
  ...(process.env.NODE_ENV === "development" && {
    transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
  }),
});

// Creates a typed React Hook returning an instance of Evolu.
const useEvolu = createUseEvolu(evolu);

/**
 * Subscribe to unexpected Evolu errors (database, network, sync issues). These
 * should not happen in normal operation, so always log them for debugging. Show
 * users a friendly error message instead of technical details.
 */
evolu.subscribeError(() => {
  const error = evolu.getError();
  if (!error) return;

  alert("🚨 Evolu error occurred! Check the console.");
  // eslint-disable-next-line no-console
  console.error(error);
});

export const EvoluMinimalExample: FC = () => {
  return (
    <div className="min-h-screen px-8 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-2 flex items-center justify-between pb-4">
          <h1 className="w-full text-center text-xl font-semibold text-gray-900">
            Minimal Todo App (Evolu + React + Vite + PWA)
          </h1>
        </div>

        <EvoluProvider value={evolu}>
          {/*
            Suspense delivers great UX (no loading flickers) and DX (no loading
            states to manage). Highly recommended with Evolu.
          */}
          <Suspense>
            <Todos />
            <OwnerActions />
            <AuthActions />
          </Suspense>
        </EvoluProvider>
      </div>
    </div>
  );
};

// Evolu uses Kysely for type-safe SQL (https://kysely.dev/).
const todosQuery = evolu.createQuery((db) =>
  db
    // Type-safe SQL: try autocomplete for table and column names.
    .selectFrom("todo")
    .select(["id", "title", "isCompleted"])
    // Soft delete: filter out deleted rows.
    .where("isDeleted", "is not", Evolu.sqliteTrue)
    // Like GraphQL, all columns except id are nullable in queries (even if
    // defined as non-nullable in schema). This enables schema evolution (no
    // migrations/versioning). Filter nulls with where + $narrowType.
    .where("title", "is not", null)
    .$narrowType<{ title: Evolu.kysely.NotNull }>()
    // Columns createdAt, updatedAt, isDeleted are auto-added to all tables.
    .orderBy("createdAt"),
);

// Extract the row type from the query for type-safe component props.
type TodosRow = typeof todosQuery.Row;

const Todos: FC = () => {
  // useQuery returns live data - component re-renders when data changes.
  const todos = useQuery(todosQuery);
  const { insert } = useEvolu();
  const [newTodoTitle, setNewTodoTitle] = useState("");

  const addTodo = () => {
    const result = insert(
      "todo",
      { title: newTodoTitle.trim() },
      {
        onComplete: () => {
          setNewTodoTitle("");
        },
      },
    );

    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
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
          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
        />
        <Button title="Add" onClick={addTodo} variant="primary" />
      </div>
    </div>
  );
};

const TodoItem: FC<{
  row: TodosRow;
}> = ({ row: { id, title, isCompleted } }) => {
  const { update } = useEvolu();

  const handleToggleCompletedClick = () => {
    update("todo", {
      id,
      // Number converts boolean to number.
      isCompleted: Number(!isCompleted),
    });
  };

  const handleRenameClick = () => {
    const newTitle = window.prompt("Edit todo", title);
    if (newTitle == null) return;

    const result = update("todo", { id, title: newTitle });
    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  const handleDeleteClick = () => {
    update("todo", {
      id,
      // Soft delete with isDeleted flag (CRDT-friendly, preserves sync history).
      isDeleted: Evolu.sqliteTrue,
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

const OwnerActions: FC = () => {
  const evolu = useEvolu();
  const appOwner = use(evolu.appOwner);

  const [showMnemonic, setShowMnemonic] = useState(false);

  // Restore owner from mnemonic to sync data across devices.
  const handleRestoreAppOwnerClick = () => {
    const mnemonic = window.prompt("Enter your mnemonic to restore your data:");
    if (mnemonic == null) return;

    const result = Evolu.Mnemonic.from(mnemonic.trim());
    if (!result.ok) {
      alert(formatTypeError(result.error));
      return;
    }

    void evolu.restoreAppOwner(result.value);
  };

  const handleResetAppOwnerClick = () => {
    if (confirm("Are you sure? This will delete all your local data.")) {
      void evolu.resetAppOwner();
    }
  };

  const handleDownloadDatabaseClick = () => {
    void evolu.exportDatabase().then((array) => {
      const blob = new Blob([array], { type: "application/x-sqlite3" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "todos.sqlite3";
      a.click();
      window.URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="mt-8 rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-4 text-lg font-medium text-gray-900">Account</h2>
      {appOwner && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <OwnerProfile
            {...{
              ownerId: appOwner.id,
              username: authResult?.username ?? "Guest",
            }}
          />
        </div>
      )}
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

        {showMnemonic && appOwner.mnemonic && (
          <div className="bg-gray-50 p-3">
            <label className="mb-2 block text-xs font-medium text-gray-700">
              Your Mnemonic (keep this safe!)
            </label>
            <textarea
              value={appOwner.mnemonic}
              readOnly
              rows={3}
              className="w-full border-b border-gray-300 bg-white px-2 py-1 font-mono text-xs focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button
            title="Restore from Mnemonic"
            onClick={handleRestoreAppOwnerClick}
          />
          <Button
            title="Download Backup"
            onClick={handleDownloadDatabaseClick}
          />
          <Button title="Reset All Data" onClick={handleResetAppOwnerClick} />
        </div>
      </div>
    </div>
  );
};

const AuthActions: FC = () => {
  const evolu = useEvolu();
  const appOwner = use(evolu.appOwner);
  const otherOwnerIds = useMemo(
    () => ownerIds.filter(({ ownerId }) => ownerId !== appOwner?.id),
    [appOwner?.id],
  );

  // Create a new owner and register it to a passkey.
  const handleRegisterClick = async () => {
    const username = window.prompt("Enter your username:");
    if (username == null) return;

    // Determine if this is a guest login or a new owner.
    const isGuest = !Boolean(authResult?.owner);

    // Register the guest owner or create a new one if this is already registered.
    const result = await localAuth.register(username, {
      service: service,
      mnemonic: isGuest ? appOwner?.mnemonic : undefined,
    });
    if (result) {
      // If this is a guest owner, we should clear the database and reload.
      // The owner is transferred to a new database on next login.
      if (isGuest) {
        void evolu.resetAppOwner({ reload: true });
        // Otherwise, just reload the page
      } else {
        evolu.reloadApp();
      }
    } else {
      alert("Failed to register profile");
    }
  };

  // Login with a specific owner id using the registered passkey.
  // Note: we already have a database created, so we need to reload.
  const handleLoginClick = async (ownerId: Evolu.OwnerId) => {
    const result = await localAuth.login(ownerId, { service });
    if (result) {
      evolu.reloadApp();
    } else {
      alert("Failed to login");
    }
  };

  // Clear all data including passkeys and metadata.
  const handleClearAllClick = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to clear all data? This will remove all passkeys and cannot be undone.",
    );
    if (!confirmed) return;
    await localAuth.clearAll({ service });
    evolu.resetAppOwner({ reload: true });
  };

  return (
    <div className="mt-8 rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-4 text-lg font-medium text-gray-900">Passkeys</h2>
      <p className="mb-4 text-sm text-gray-600">
        Register a new passkey or choose a previously registered one.
      </p>
      <div className="flex gap-3">
        <Button
          title="Register Passkey"
          className="flex-1"
          onClick={handleRegisterClick}
        />
        <Button
          title="Clear All"
          className="flex-1"
          onClick={handleClearAllClick}
        />
      </div>
      {otherOwnerIds.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {otherOwnerIds.map(({ ownerId, username }) => (
            <OwnerProfile
              key={ownerId}
              {...{ ownerId, username, handleLoginClick }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const OwnerProfile: FC<{
  ownerId: Evolu.OwnerId;
  username: string;
  handleLoginClick?: (ownerId: Evolu.OwnerId) => void;
}> = ({ ownerId, username, handleLoginClick }) => {
  return (
    <div className="flex justify-between gap-3">
      <div className="flex items-center gap-3">
        <EvoluIdenticon id={ownerId} />
        <span className="text-sm font-medium text-gray-900">{username}</span>
        <span className="text-xs text-gray-500 italic">{ownerId}</span>
      </div>
      {handleLoginClick && (
        <Button title="Login" onClick={() => handleLoginClick(ownerId)} />
      )}
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

/**
 * Formats Evolu Type errors into user-friendly messages.
 *
 * Evolu Type typed errors ensure every error type used in schema must have a
 * formatter. TypeScript enforces this at compile-time, preventing unhandled
 * validation errors from reaching users.
 *
 * The `createFormatTypeError` function handles both built-in and custom errors,
 * and lets us override default formatting for specific errors.
 *
 * Click on `createFormatTypeError` below to see how to write your own
 * formatter.
 */
const formatTypeError = Evolu.createFormatTypeError<
  Evolu.MinLengthError | Evolu.MaxLengthError
>((error): string => {
  switch (error.type) {
    case "MinLength":
      return `Text must be at least ${error.min} character${error.min === 1 ? "" : "s"} long`;
    case "MaxLength":
      return `Text is too long (maximum ${error.max} characters)`;
  }
});
