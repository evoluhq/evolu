import {
  createEvolu,
  createFormatTypeError,
  FiniteNumber,
  getOrThrow,
  id,
  json,
  kysely,
  maxLength,
  MinLengthError,
  Mnemonic,
  NonEmptyString,
  NonEmptyString1000,
  nullOr,
  object,
  SimpleName,
  SqliteBoolean,
  sqliteTrue,
  ValidMutationSizeError,
} from "@evolu/common";
import {
  createUseEvolu,
  EvoluProvider,
  useAppOwner,
  useEvoluError,
  useQuery,
} from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";
import { ChangeEvent, FC, memo, Suspense, useEffect, useState } from "react";
const TodoId = id("Todo");
type TodoId = typeof TodoId.Type;

const TodoCategoryId = id("TodoCategory");
type TodoCategoryId = typeof TodoCategoryId.Type;

// A custom branded Type.
const NonEmptyString50 = maxLength(50)(NonEmptyString);
// string & Brand<"MinLength1"> & Brand<"MaxLength50">
type NonEmptyString50 = typeof NonEmptyString50.Type;

// SQLite supports JSON-compatible values.
const Person = object({
  name: NonEmptyString50,
  // Did you know that JSON.stringify converts NaN (a number) into null?
  // Now, imagine that `age` accidentally becomes null. To prevent this, use FiniteNumber.
  age: FiniteNumber,
});
type Person = typeof Person.Type;

// SQLite stores JSON-compatible values as strings. Fortunately, Evolu provides
// a convenient `json` Type Factory for type-safe JSON serialization and parsing.
const [PersonJson, _personToPersonJson, _personJsonToPerson] = json(
  Person,
  "PersonJson",
);
// string & Brand<"PersonJson">
type PersonJson = typeof PersonJson.Type;
const Schema = {
  todo: {
    id: TodoId,
    title: NonEmptyString1000,
    // SQLite doesn't support the boolean type; it uses 0 (false) and 1 (true) instead.
    // SqliteBoolean provides seamless conversion.
    isCompleted: nullOr(SqliteBoolean),
    categoryId: nullOr(TodoCategoryId),
    personJson: nullOr(PersonJson),
  },
  todoCategory: {
    id: TodoCategoryId,
    name: NonEmptyString50,
  },
};

const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  reloadUrl: "/",
  name: getOrThrow(SimpleName.from("evolu-react-electron-example-v3")),

  ...(process.env.NODE_ENV === "development" && {
    transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
  }),

  // Indexes are not necessary for development but are recommended for production.
  // https://www.evolu.dev/docs/indexes
  indexes: (create) => [
    create("todoCreatedAt").on("todo").column("createdAt"),
    create("todoCategoryCreatedAt").on("todoCategory").column("createdAt"),
  ],

  // enableLogging: true,
});

const todosWithCategories = evolu.createQuery(
  (db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "categoryId", "personJson"])
      .where("isDeleted", "is not", 1)
      // Filter null value and ensure non-null type.
      .where("title", "is not", null)
      .$narrowType<{ title: kysely.NotNull }>()
      .orderBy("createdAt")
      // https://kysely.dev/docs/recipes/relations
      .select((eb) => [
        kysely
          .jsonArrayFrom(
            eb
              .selectFrom("todoCategory")
              .select(["todoCategory.id", "todoCategory.name"])
              .where("isDeleted", "is not", 1)
              .orderBy("createdAt"),
          )
          .as("categories"),
      ]),
  {
    // logQueryExecutionTime: true,
    // logExplainQueryPlan: true,
  },
);

type TodosWithCategoriesRow = typeof todosWithCategories.Row;

const todoCategories = evolu.createQuery((db) =>
  db
    .selectFrom("todoCategory")
    .select(["id", "name"])
    .where("isDeleted", "is not", 1)
    // Filter null value and ensure non-null type.
    .where("name", "is not", null)
    .$narrowType<{ name: kysely.NotNull }>()
    .orderBy("createdAt"),
);

type TodoCategoriesRow = typeof todoCategories.Row;

const useEvolu = createUseEvolu(evolu);

export const EvoluExample = memo(function EvoluExample() {
  return (
    <div>
      <div>
        <EvoluProvider value={evolu}>
          <NotificationBar />
          <Suspense>
            <Todos />
            <TodoCategories />
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
    <button style={{ flexShrink: 0 }} onClick={onClick}>
      {title}
    </button>
  );
};

const Todos: FC = () => {
  const rows = useQuery(todosWithCategories);

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
          style={{ marginRight: "1rem", width: "100%" }}
          value={text}
          onChange={(v) => {
            setText(v.target.value);
          }}
        />
        <Button title="Add Todo" onClick={handleAddTodoClick} />
      </div>
      <ul style={{ margin: 0, padding: 0 }}>
        {rows.map((row) => (
          <TodoItem key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
};

const TodoItem = memo<{
  row: TodosWithCategoriesRow;
}>(function TodoItem({
  row: { id, title, isCompleted, categoryId, categories },
}) {
  const { update } = useEvolu();

  const handleToggleCompletedClick = () => {
    // const s = performance.now();
    update("todo", { id, isCompleted: Number(!isCompleted) });
  };

  const handleDeleteClick = () => {
    // const s = performance.now();
    update("todo", { id, isDeleted: sqliteTrue });
  };

  return (
    <li style={{ listStyleType: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <label>
          <input
            type="checkbox"
            checked={!!isCompleted}
            onChange={handleToggleCompletedClick}
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
          <TodoCategorySelect
            categories={categories}
            selected={categoryId}
            onSelect={(categoryId) => {
              update("todo", { id, categoryId });
            }}
          />
          <Button title="Delete" onClick={handleDeleteClick} />
        </div>
      </div>
    </li>
  );
});

const TodoCategorySelect: FC<{
  categories: TodosWithCategoriesRow["categories"];
  selected: TodoCategoryId | null;
  onSelect: (value: TodoCategoryId | null) => void;
}> = ({ categories, selected, onSelect }) => {
  const nothingSelected = "";
  const value =
    selected && categories.find((row) => row.id === selected)
      ? selected
      : nothingSelected;

  return (
    <select
      value={value}
      onChange={({ target: { value } }: ChangeEvent<HTMLSelectElement>) => {
        onSelect(value === nothingSelected ? null : (value as TodoCategoryId));
      }}
    >
      <option value={nothingSelected}>-- no category --</option>
      {categories.map(({ id, name }) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
};

const TodoCategories: FC = () => {
  const rows = useQuery(todoCategories);
  const { insert } = useEvolu();
  const [text, setText] = useState("");

  const handleAddCategoryClick = () => {
    if (!text) return;
    insert("todoCategory", {
      name: text,
    });
    setText("");
  };

  return (
    <div>
      <h2>Categories</h2>

      <div style={{ display: "flex", marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Category Name"
          style={{ marginRight: "1rem", width: "100%" }}
          value={text}
          onChange={(v) => {
            setText(v.target.value);
          }}
        />
        <Button title="Add Category" onClick={handleAddCategoryClick} />
      </div>
      <ul style={{ margin: 0, padding: 0 }}>
        {rows.map((row) => (
          <TodoCategoryItem row={row} key={row.id} />
        ))}
      </ul>
    </div>
  );
};

const TodoCategoryItem = memo<{
  row: TodoCategoriesRow;
}>(function TodoItem({ row: { id, name } }) {
  const { update } = useEvolu();

  const handleDeleteClick = () => {
    update("todoCategory", { id, isDeleted: sqliteTrue });
  };

  return (
    <>
      <li key={id} style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{name}</span>
        <div>
          <Button title="Delete" onClick={handleDeleteClick} />
        </div>
      </li>
    </>
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
    <div>
      <p>
        To sync your data across devices, open this app on another device and
        use the mnemonic phrase to restore your account. The mnemonic acts as
        your encryption key and backup.
      </p>
      <div>
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

              const result = Mnemonic.from(restoreMnemonic.trim());
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
const formatTypeError = createFormatTypeError<
  ValidMutationSizeError | MinLengthError
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
