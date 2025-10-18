import * as Evolu from "@evolu/common";
import {
  createUseEvolu,
  EvoluProvider,
  useAppOwner,
  useEvoluError,
  useQuery,
} from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";
import { FC, Suspense, useEffect, useState } from "react";

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

// Create Evolu instance for the React web platform.
const evolu = Evolu.createEvolu(evoluReactWebDeps)(Schema, {
  name: Evolu.SimpleName.orThrow("evolu-playground-minimal"),

  reloadUrl: "/playgrounds/minimal",

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

export const EvoluExample: FC = () => {
  return (
    <div>
      <div>
        <EvoluProvider value={evolu}>
          <NotificationBar />
          {/*
            Suspense delivers great UX (no loading flickers) and DX (no loading
            states to manage). Highly recommended with Evolu.
          */}
          <Suspense>
            <Todos />
            <OwnerActions />
          </Suspense>
        </EvoluProvider>
      </div>
    </div>
  );
};

const NotificationBar: FC = () => {
  const evoluError = useEvoluError();
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (evoluError) setShowError(true);
  }, [evoluError]);

  if (!evoluError || !showError) return null;

  return (
    <div>
      <p>{`Error: ${JSON.stringify(evoluError)}`}</p>
      <Button
        title="Close"
        onClick={() => {
          setShowError(false);
        }}
      />
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
    <div>
      <h2>Todos</h2>
      <div style={{ display: "flex", marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="What needs to be done?"
          style={{
            marginRight: "1rem",
            width: "100%",
            paddingLeft: "1rem",
            paddingRight: "1rem",
            borderRadius: "0.5rem",
          }}
          value={newTodoTitle}
          onChange={(v) => {
            setNewTodoTitle(v.target.value);
          }}
        />
        <Button title="Add Todo" onClick={addTodo} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {todos.map((todo) => (
          <TodoItem key={todo.id} row={todo} />
        ))}
      </div>
    </div>
  );
};

const TodoItem: FC<{
  row: TodosRow;
}> = ({ row: { id, title, isCompleted } }) => {
  const { update } = useEvolu();

  const handleToggleCompletedClick = () => {
    update("todo", { id, isCompleted: Number(!isCompleted) });
  };

  const handleDeleteClick = () => {
    update("todo", {
      id,
      // Soft delete with isDeleted flag (CRDT-friendly, preserves sync history).
      isDeleted: Evolu.sqliteTrue,
    });
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <label
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
        }}
      >
        <input
          type="checkbox"
          checked={!!isCompleted}
          onChange={handleToggleCompletedClick}
          style={{
            width: "1rem",
            height: "1rem",
          }}
        />
        <span
          style={{
            textDecoration: isCompleted ? "line-through" : "none",
            marginLeft: "0.5rem",
          }}
        >
          {title}
        </span>
      </label>
      <div>
        <Button title="Delete" onClick={handleDeleteClick} />
      </div>
    </div>
  );
};

const OwnerActions: FC = () => {
  const appOwner = useAppOwner();
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [showRestoreTextarea, setShowRestoreTextarea] = useState(false);
  const [restoreMnemonic, setRestoreMnemonic] = useState("");

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
    if (confirm("Are you sure? It will delete all your local data.")) {
      void evolu.resetAppOwner();
    }
  };

  const handleDownloadDatabaseClick = () => {
    void evolu.exportDatabase().then((array) => {
      const blob = new Blob([array.slice()], { type: "application/x-sqlite3" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "todos.sqlite3";
      a.click();
      window.URL.revokeObjectURL(url);
    });
  };

  return (
    <div
      style={{
        marginTop: "1rem",
        backgroundColor: "#f5f5f5",
        padding: "1rem",
        borderRadius: "0.5rem",
      }}
    >
      <span
        style={{
          display: "block",
          textAlign: "left",
          marginBottom: "1rem",
        }}
      >
        Todos are stored in local SQLite. When you sync across devices, your
        data is end-to-end encrypted using your mnemonic.
      </span>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          justifyContent: "start",
        }}
      >
        <Button
          title={`${showMnemonic ? "Hide" : "Show"} Mnemonic`}
          onClick={() => {
            setShowMnemonic(!showMnemonic);
            setShowRestoreTextarea(false);
          }}
        />
        <Button
          title="Restore Owner"
          onClick={() => {
            setShowRestoreTextarea(true);
            setShowMnemonic(false);
          }}
        />
        <Button title="Reset Owner" onClick={handleResetAppOwnerClick} />
        <Button
          title="Download Database"
          onClick={handleDownloadDatabaseClick}
        />
      </div>
      {showMnemonic && appOwner?.mnemonic && (
        <div>
          <textarea
            style={{
              width: "100%",
              resize: "none",
              padding: "0.5rem",
              marginTop: "1rem",
            }}
            value={appOwner.mnemonic}
            readOnly
            rows={2}
          />
        </div>
      )}

      {showRestoreTextarea && (
        <div>
          <textarea
            placeholder="Your Mnemonic"
            rows={2}
            value={restoreMnemonic}
            onChange={(e) => {
              setRestoreMnemonic(e.target.value);
            }}
            style={{
              width: "100%",
              resize: "none",
              padding: "0.5rem",
              marginTop: "1rem",
            }}
          />
          <Button title="Restore" onClick={handleRestoreAppOwnerClick} />
        </div>
      )}
    </div>
  );
};

const Button: FC<{
  title: string;
  onClick: () => void;
}> = ({ title, onClick }) => {
  return (
    <button
      style={{ flexShrink: 0, backgroundColor: "#000", color: "#fff" }}
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
