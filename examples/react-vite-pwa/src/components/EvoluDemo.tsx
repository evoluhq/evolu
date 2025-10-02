"use client";

import {
  timestampBytesToTimestamp,
  createEvolu,
  createFormatTypeError,
  FiniteNumber,
  id,
  idToBinaryId,
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

// Define the Evolu schema that describes the database tables and column types.
// First, define the typed IDs.

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
const [PersonJson, personToPersonJson, _personJsonToPerson] = json(
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

const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  name: SimpleName.orThrow("evolu-react-vite-pwa-example"),
  reloadUrl: "/",

  ...(process.env.NODE_ENV === "development" && {
    transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
  }),

  // Indexes are not required for development but are recommended for production.
  // https://www.evolu.dev/docs/indexes
  indexes: (create) => [
    create("todoCreatedAt").on("todo").column("createdAt"),
    create("todoCategoryCreatedAt").on("todoCategory").column("createdAt"),
  ],

  // enableLogging: true,
});

const useEvolu = createUseEvolu(evolu);

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

evolu.subscribeError(() => {
  const error = evolu.getError();
  if (!error) return;
  alert("🚨 Evolu error occurred! Check the console.");

  console.error(error);
});

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
  className?: string;
  onClick: () => void;
}> = ({ title, className, onClick }) => {
  return (
    <button className={className} onClick={onClick}>
      {title}
    </button>
  );
};

const Todos: FC = () => {
  const rows = useQuery(todosWithCategories);

  const { insert } = useEvolu();

  const handleAddTodoClick = () => {
    const title = window.prompt("What needs to be done?");
    if (title == null) return; // escape or cancel

    const person = Person.orThrow({ name: "Joe", age: 32 });

    const result = insert("todo", {
      title,
      personJson: personToPersonJson(person),
    });

    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  return (
    <div>
      <h2>Todos</h2>
      <ul style={{ margin: 0, padding: 0 }}>
        {rows.map((row) => (
          <TodoItem key={row.id} row={row} />
        ))}
      </ul>
      <Button title="Add Todo" onClick={handleAddTodoClick} />
    </div>
  );
};

const TodoItem: FC<{
  row: TodosWithCategoriesRow;
}> = ({ row: { id, title, isCompleted, categoryId, categories } }) => {
  const { update } = useEvolu();

  const handleToggleCompletedClick = () => {
    update("todo", { id, isCompleted: Number(!isCompleted) });
  };

  const handleRenameClick = () => {
    const title = window.prompt("Todo Name");
    if (title == null) return; // escape or cancel
    const result = update("todo", { id, title });
    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  const handleDeleteClick = () => {
    update("todo", { id, isDeleted: sqliteTrue });
  };

  const titleHistory = evolu.createQuery((db) =>
    db
      .selectFrom("evolu_history")
      .select(["value", "timestamp"])
      .where("table", "==", "todo")
      .where("id", "==", idToBinaryId(id))
      .where("column", "==", "title")
      // `value` isn't typed; this is how we can narrow its type.
      .$narrowType<{ value: (typeof Schema)["todo"]["title"]["Type"] }>()
      .orderBy("timestamp", "desc"),
  );

  const handleHistoryClick = () => {
    void evolu.loadQuery(titleHistory).then((rows) => {
      const rowsWithTimestamp = rows.map((row) => ({
        ...row,
        timestamp: timestampBytesToTimestamp(row.timestamp),
      }));
      alert(JSON.stringify(rowsWithTimestamp, null, 2));
    });
  };

  const handleCategorySelect = (categoryId: TodoCategoryId | null) => {
    update("todo", { id, categoryId });
  };

  return (
    <li className="list-none pl-0">
      <div className="flex items-center gap-1">
        <label className="flex w-full items-center">
          <input
            type="checkbox"
            checked={!!isCompleted}
            onChange={handleToggleCompletedClick}
            className="relative mr-2 size-4 rounded-sm border-zinc-300 text-blue-600 focus:ring-blue-600"
          />
          <span
            className="text-sm font-semibold"
            style={{ textDecoration: isCompleted ? "line-through" : "none" }}
          >
            {title}
          </span>
        </label>
        <div className="flex gap-1">
          <TodoCategorySelect
            categories={categories}
            selected={categoryId}
            onSelect={handleCategorySelect}
          />
          <Button
            className="ml-auto"
            title="Rename"
            onClick={handleRenameClick}
          />
          <Button title="Delete" onClick={handleDeleteClick} />
          <Button title="Show Title History" onClick={handleHistoryClick} />
        </div>
      </div>
    </li>
  );
};

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
      className="block w-full max-w-48 min-w-32 shrink rounded-full border-0 py-1 pl-3 text-zinc-900 ring-1 ring-zinc-300 ring-inset focus:ring-2 focus:ring-blue-600 sm:text-sm/6 dark:text-white"
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

  const handleAddCategoryClick = () => {
    const name = window.prompt("Category Name");
    if (name == null) return; // escape or cancel
    const result = insert("todoCategory", { name });
    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  return (
    <div>
      <h2>Categories</h2>
      <ul style={{ margin: 0, padding: 0 }}>
        {rows.map((row) => (
          <TodoCategoryItem row={row} key={row.id} />
        ))}
      </ul>
      <Button title="Add Category" onClick={handleAddCategoryClick} />
    </div>
  );
};

const TodoCategoryItem: FC<{ row: TodoCategoriesRow }> = ({
  row: { id, name },
}) => {
  const { update } = useEvolu();

  const handleRenameClick = () => {
    const name = window.prompt("Category Name");
    if (name == null) return; // escape or cancel
    const result = update("todoCategory", { id, name });
    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  const handleDeleteClick = () => {
    update("todoCategory", { id, isDeleted: sqliteTrue });
  };

  return (
    <>
      <li key={id} className="flex list-none items-center gap-1 pl-0">
        <span className="text-sm font-semibold">{name}</span>
        <Button
          className="ml-auto"
          title="Rename"
          onClick={handleRenameClick}
        />
        <Button title="Delete" onClick={handleDeleteClick} />
      </li>
    </>
  );
};

const OwnerActions: FC = () => {
  const evolu = useEvolu();
  const owner = useAppOwner();

  const [showMnemonic, setShowMnemonic] = useState(false);

  const handleRestoreAppOwnerClick = () => {
    const mnemonic = window.prompt("Your Mnemonic");
    if (mnemonic == null) return; // escape or cancel
    const result = Mnemonic.from(mnemonic.trim());
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
    <div className="mt-6">
      <h2>Owner Actions</h2>
      <p>
        Open this page on another device and use your mnemonic to restore your
        data.
      </p>
      <div className="flex gap-1">
        <Button
          title={`${showMnemonic ? "Hide" : "Show"} Mnemonic`}
          onClick={() => {
            setShowMnemonic(!showMnemonic);
          }}
        />
        <Button title="Restore Owner" onClick={handleRestoreAppOwnerClick} />
        <Button title="Reset Owner" onClick={handleResetAppOwnerClick} />
        <Button
          title="Download Database"
          onClick={handleDownloadDatabaseClick}
        />
      </div>
      {showMnemonic && owner?.mnemonic && (
        <div>
          <textarea
            value={owner.mnemonic}
            readOnly
            rows={2}
            style={{ width: 320 }}
          />
        </div>
      )}
    </div>
  );
};
