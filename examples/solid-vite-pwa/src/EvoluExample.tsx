import {
  assert,
  createEvolu,
  FiniteNumber,
  getOrThrow,
  id,
  json,
  kysely,
  maxLength,
  Mnemonic,
  NonEmptyString,
  NonEmptyString1000,
  nullOr,
  object,
  SimpleName,
  SqliteBoolean,
} from "@evolu/common";
import {
  createUseEvolu,
  EvoluProvider,
  useAppOwner,
  useEvoluError,
  useQuery,
} from "@evolu/solid";
import { evoluWebDeps } from "@evolu/web";
import { For, Show, Suspense, type Component } from "solid-js";

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
const PersonJson = json(Person, "PersonJson");
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

const evolu = createEvolu(evoluWebDeps)(Schema, {
  name: getOrThrow(SimpleName.from("evolu-solid-vite-pwa-example")),
  reloadUrl: "/",

  ...(import.meta.env.DEV && {
    syncUrl: "http://localhost:4000",
  }),

  initialData: (evolu) => {
    const todoCategory = evolu.insert("todoCategory", {
      name: "Not Urgent",
    });

    // This is a developer error, which should be fixed immediately.
    assert(todoCategory.ok, "invalid initial data");

    evolu.insert("todo", {
      title: "Try Solid Suspense",
      categoryId: todoCategory.value.id,
    });
  },

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

export const EvoluExample: Component = () => {
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
};

const NotificationBar: Component = () => {
  const error = useEvoluError();

  return (
    <Show when={error()}>
      <div
        style={{
          padding: "1rem",
          "background-color": "#fee",
          border: "1px solid #fcc",
          "border-radius": "4px",
          margin: "1rem 0",
        }}
      >
        <strong>Error:</strong> {String(error())}
      </div>
    </Show>
  );
};

const Button: Component<{
  title: string;
  class?: string;
  onClick: () => void;
}> = (props) => {
  return (
    <button
      class={props.class}
      onClick={props.onClick}
      style={{ margin: "0.25rem" }}
    >
      {props.title}
    </button>
  );
};

const Todos: Component = () => {
  const rows = useQuery(todosWithCategories);
  const evolu = useEvolu();

  const handleAddTodoClick = () => {
    const title = prompt("Todo title");
    if (!title) return;
    evolu.insert("todo", { title });
  };

  return (
    <div>
      <h2>Todos</h2>
      <Button title="Add Todo" onClick={handleAddTodoClick} />
      <For each={rows()}>{(row) => <TodoItem row={row} />}</For>
    </div>
  );
};

const TodoItem: Component<{
  row: TodosWithCategoriesRow;
}> = (props) => {
  const evolu = useEvolu();

  const handleToggleCompletedClick = () => {
    evolu.update("todo", {
      id: props.row.id,
      isCompleted: !props.row.isCompleted,
    });
  };

  const handleRenameClick = () => {
    const title = prompt("Todo title", props.row.title);
    if (!title) return;
    evolu.update("todo", { id: props.row.id, title });
  };

  const handleDeleteClick = () => {
    evolu.update("todo", { id: props.row.id, isDeleted: true });
  };

  const handleHistoryClick = () => {
    alert("History feature not available in this version.");
  };

  const handleCategorySelect = (categoryId: TodoCategoryId | null) => {
    evolu.update("todo", { id: props.row.id, categoryId });
  };

  return (
    <div
      style={{
        "border-bottom": "1px solid #ccc",
        padding: "0.5rem 0",
        display: "flex",
        "flex-direction": "row",
        "align-items": "center",
        gap: "0.5rem",
        "justify-content": "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "flex-grow": 1,
        }}
      >
        <input
          type="checkbox"
          checked={Boolean(props.row.isCompleted)}
          onChange={handleToggleCompletedClick}
        />
        <span
          style={{
            "text-decoration": props.row.isCompleted ? "line-through" : "none",
            "margin-left": "0.5rem",
          }}
        >
          {props.row.title}
        </span>
      </div>
      <div>
        <TodoCategorySelect
          categories={props.row.categories}
          selected={props.row.categoryId}
          onSelect={handleCategorySelect}
        />
      </div>
      <div>
        <Button title="Rename" onClick={handleRenameClick} />
        <Button title="Delete" onClick={handleDeleteClick} />
        <Button title="History" onClick={handleHistoryClick} />
      </div>
    </div>
  );
};

const TodoCategorySelect: Component<{
  categories: TodosWithCategoriesRow["categories"];
  selected: TodoCategoryId | null;
  onSelect: (value: TodoCategoryId | null) => void;
}> = (props) => {
  return (
    <select
      value={props.selected || ""}
      onChange={(e) => {
        const value = e.currentTarget.value;
        props.onSelect(value ? (value as TodoCategoryId) : null);
      }}
    >
      <option value="">No category</option>
      <For each={props.categories}>
        {(category) => <option value={category.id}>{category.name}</option>}
      </For>
    </select>
  );
};

const TodoCategories: Component = () => {
  const rows = useQuery(todoCategories);
  const evolu = useEvolu();

  const handleAddCategoryClick = () => {
    const name = prompt("Category name");
    if (!name) return;
    evolu.insert("todoCategory", { name });
  };

  return (
    <div style={{ "margin-top": "2rem" }}>
      <h2>Categories</h2>
      <Button title="Add Category" onClick={handleAddCategoryClick} />
      <For each={rows()}>{(row) => <TodoCategoryItem row={row} />}</For>
    </div>
  );
};

const TodoCategoryItem: Component<{ row: TodoCategoriesRow }> = (props) => {
  const evolu = useEvolu();

  const handleRenameClick = () => {
    const name = prompt("Category name", props.row.name);
    if (!name) return;
    evolu.update("todoCategory", { id: props.row.id, name });
  };

  const handleDeleteClick = () => {
    evolu.update("todoCategory", { id: props.row.id, isDeleted: true });
  };

  return (
    <div
      style={{
        "border-bottom": "1px solid #ccc",
        padding: "0.5rem 0",
        display: "flex",
        "flex-direction": "row",
        "align-items": "center",
        "justify-content": "space-between",
      }}
    >
      <span>{props.row.name}</span>
      <div>
        <Button title="Rename" onClick={handleRenameClick} />
        <Button title="Delete" onClick={handleDeleteClick} />
      </div>
    </div>
  );
};

const OwnerActions: Component = () => {
  const appOwner = useAppOwner();
  const evolu = useEvolu();

  const handleRestoreAppOwnerClick = () => {
    const mnemonic = prompt("Mnemonic");
    if (!mnemonic) return;
    evolu.restoreAppOwner(mnemonic as Mnemonic);
  };

  const handleResetAppOwnerClick = () => {
    if (confirm("Are you sure?")) {
      evolu.resetAppOwner();
    }
  };

  const handleDownloadDatabaseClick = () => {
    evolu.exportDatabase().then((database) => {
      const blob = new Blob([database], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "database.db";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div style={{ "margin-top": "2rem" }}>
      <h2>Owner Actions</h2>
      <Show when={appOwner()}>
        <p>
          <strong>Mnemonic:</strong> {appOwner()!.mnemonic}
        </p>
        <p>
          <strong>ID:</strong> {String(appOwner()!.id)}
        </p>
      </Show>
      <div>
        <Button title="Restore Owner" onClick={handleRestoreAppOwnerClick} />
        <Button title="Reset Owner" onClick={handleResetAppOwnerClick} />
        <Button
          title="Download Database"
          onClick={handleDownloadDatabaseClick}
        />
      </div>
    </div>
  );
};
