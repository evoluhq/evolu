import * as Evolu from "@evolu/common";
import {
  createUseEvolu,
  EvoluProvider,
  useAppOwner,
  useEvoluError,
  useQuery,
} from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";
import { FC, memo, Suspense, useEffect, useState } from "react";

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
    title: Evolu.NonEmptyString1000,
    // SQLite doesn't support the boolean type; it uses 0 (false) and 1 (true) instead.
    // SqliteBoolean provides seamless conversion.
    isCompleted: Evolu.nullOr(Evolu.SqliteBoolean),
  },
};

// Create Evolu instance for the React web platform.
const evolu = Evolu.createEvolu(evoluReactWebDeps)(Schema, {
  reloadUrl: "/",
  name: Evolu.getOrThrow(Evolu.SimpleName.from("evolu-react-electron-minimal")),

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

const todosQuery = evolu.createQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted"])
    .where("isDeleted", "is not", 1)
    // Filter null value and ensure non-null type.
    .where("title", "is not", null)
    .$narrowType<{ title: Evolu.kysely.NotNull }>()
    .orderBy("createdAt"),
);

type TodosRow = typeof todosQuery.Row;

export const EvoluExample = memo(function EvoluExample() {
  return (
    <div>
      <div>
        <EvoluProvider value={evolu}>
          <NotificationBar />
          <Suspense>
            <Todos />
            <OwnerActions />
          </Suspense>
        </EvoluProvider>
      </div>
    </div>
  );
});

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

const Todos: FC = () => {
  const rows = useQuery(todosQuery);

  const { insert } = useEvolu();

  const [text, setText] = useState("");

  const handleAddTodoClick = () => {
    if (!text) return;
    insert("todo", {
      title: text,
    });
    setText("");
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
          value={text}
          onChange={(v) => {
            setText(v.target.value);
          }}
        />
        <Button title="Add Todo" onClick={handleAddTodoClick} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {rows.map((row) => (
          <TodoItem key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
};

const TodoItem = memo<{
  row: TodosRow;
}>(function TodoItem({ row: { id, title, isCompleted } }) {
  const { update } = useEvolu();

  const handleToggleCompletedClick = () => {
    update("todo", { id, isCompleted: Number(!isCompleted) });
  };

  const handleDeleteClick = () => {
    update("todo", { id, isDeleted: Evolu.sqliteTrue });
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
});

const OwnerActions: FC = () => {
  const evolu = useEvolu();
  const owner = useAppOwner();
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [showRestoreTextarea, setShowRestoreTextarea] = useState(false);
  const [restoreMnemonic, setRestoreMnemonic] = useState("");

  const handleResetAppOwnerClick = () => {
    if (confirm("Are you sure? It will delete all your local data.")) {
      void evolu.resetAppOwner();
    }
  };

  const handleDownloadDatabaseClick = () => {
    void evolu.exportDatabase().then((array) => {
      const blob = new Blob([array.slice()], {
        type: "application/x-sqlite3",
      });
      const a = document.createElement("a");
      document.body.appendChild(a);
      a.href = window.URL.createObjectURL(blob);
      a.download = "db.sqlite3";
      a.addEventListener("click", function () {
        setTimeout(function () {
          window.URL.revokeObjectURL(a.href);
          a.remove();
        }, 1000);
      });
      a.click();
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
      {showMnemonic && owner?.mnemonic && (
        <div>
          <textarea
            style={{
              width: "100%",
              resize: "none",
              padding: "0.5rem",
              marginTop: "1rem",
            }}
            value={owner.mnemonic}
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
          <Button
            title="Restore"
            onClick={() => {
              // const result = _.parseMnemonic(restoreMnemonic);
              // if (!result.ok) {
              //   alert(_.formatParseMnemonicError(result.error));
              //   return;
              // }
              // void evolu.restoreAppOwner(result.value);

              const result = Evolu.Mnemonic.from(restoreMnemonic.trim());
              if (!result.ok) {
                alert(formatTypeError(result.error));
                return;
              }
              void evolu.restoreAppOwner(result.value);
            }}
          />
        </div>
      )}
    </div>
  );
};

/**
 * The `createFormatTypeError` function creates a unified error formatter that
 * handles both Evolu Type's built-in errors and custom errors. It also lets us
 * override the default formatting for specific errors.
 *
 * If you prefer not to reuse built-in error formatters, you can write your own
 * `formatTypeError` function from scratch. See the commented-out example at the
 * end of this file.
 */
const formatTypeError = Evolu.createFormatTypeError<
  Evolu.ValidMutationSizeError | Evolu.MinLengthError
>((error): string => {
  switch (error.type) {
    /**
     * If schema types are used correctly (e.g., maxLength), this error should
     * not occur. If it does, it indicates a developer mistake.
     */
    case "ValidMutationSize":
      return "This is a developer error, it should not happen 🤨";
    // Overrides a built-in error formatter.
    case "MinLength":
      return `Minimal length is: ${error.min}`;
  }
});
