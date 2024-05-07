import {
  Component,
  Show,
  Suspense,
  createEffect,
  createSignal,
} from "solid-js";

import * as S from "@effect/schema/Schema";
import { formatError } from "@effect/schema/TreeFormatter";

import {
  createEvolu,
  useEvolu,
  useEvoluError,
  useOwner,
  useQuery,
  ExtractRow,
  NonEmptyString1000,
  NotNull,
  SqliteBoolean,
  String,
  canUseDom,
  cast,
  createIndexes,
  database,
  id,
  jsonArrayFrom,
  table,
  parseMnemonic
} from "@evolu/solid";


import { Effect, Exit } from "effect";
import { EvoluContext } from "@evolu/solid";

// Let's start with the database schema.

// Every table needs Id. It's defined as a branded type.
// Branded types make database types super safe.
const TodoId = id("Todo");
type TodoId = S.Schema.Type<typeof TodoId>;

const TodoCategoryId = id("TodoCategory");
type TodoCategoryId = S.Schema.Type<typeof TodoCategoryId>;

// This branded type ensures a string must be validated before being put
// into the database. Check the prompt function to see Schema validation.
const NonEmptyString50 = String.pipe(
  S.minLength(1),
  S.maxLength(50),
  S.brand("NonEmptyString50"),
);
type NonEmptyString50 = S.Schema.Type<typeof NonEmptyString50>;

// Now we can define tables.
const TodoTable = table({
  id: TodoId,
  title: NonEmptyString1000,
  isCompleted: S.nullable(SqliteBoolean),
  categoryId: S.nullable(TodoCategoryId),
});
type TodoTable = S.Schema.Type<typeof TodoTable>;

// Evolu tables can contain typed JSONs.
const SomeJson = S.struct({ foo: S.string, bar: S.boolean });
type SomeJson = S.Schema.Type<typeof SomeJson>;

// Let's make a table with JSON value.
const TodoCategoryTable = table({
  id: TodoCategoryId,
  name: NonEmptyString50,
  json: S.nullable(SomeJson),
});
type TodoCategoryTable = S.Schema.Type<typeof TodoCategoryTable>;

// Now, we can define the database schema.
const Database = database({
  todo: TodoTable,
  todoCategory: TodoCategoryTable,
});
type Database = S.Schema.Type<typeof Database>;

/**
 * Indexes
 *
 * Indexes are not necessary for development but are required for production.
 *
 * Before adding an index, use `logExecutionTime` and `logExplainQueryPlan`
 * createQuery options.
 *
 * SQLite has a tool for Index Recommendations (SQLite Expert)
 * https://sqlite.org/cli.html#index_recommendations_sqlite_expert_
 */
const indexes = [
  createIndexes("indexTodoCreatedAt").on("todo").column("createdAt"),

  createIndexes("indexTodoCategoryCreatedAt")
    .on("todoCategory")
    .column("createdAt"),
];

const evolu = createEvolu(Database, { indexes });

console.log('XXX evolu XXX:', evolu)

const createFixtures = (): Promise<void> =>
  Promise.all(
    evolu.loadQueries([
      evolu.createQuery((db) => db.selectFrom("todo").selectAll()),
      evolu.createQuery((db) => db.selectFrom("todoCategory").selectAll()),
    ]),
  ).then(([todos, categories]) => {
    if (todos.row || categories.row) return;

    const { id: notUrgentCategoryId } = evolu.create("todoCategory", {
      name: S.decodeSync(NonEmptyString50)("Not Urgent"),
    });

    evolu.create("todo", {
      title: S.decodeSync(NonEmptyString1000)("Try React Suspense"),
      categoryId: notUrgentCategoryId,
    });
  });

export default function App() {
  const [currentTab, setCurrentTab] = createSignal<"todos" | "categories">(
    "todos",
  );

  const handleTabClick = (): void => {
    setCurrentTab(currentTab() === "todos" ? "categories" : "todos");
  };

  return (
    <EvoluContext.Provider value={evolu}>
      <NotificationBar />
      <h2 class="mt-6 text-xl font-semibold">
        {currentTab() === "todos" ? "Todos" : "Categories"}
      </h2>
             
      <Suspense>
        {currentTab() === "todos" ? <Todos /> : <TodoCategories />}
        <Button title="Switch Tab" onClick={handleTabClick} />
        <p class="my-4">
          To try React Suspense, click the `Switch Tab` button and rename a
          category. Then click the `Switch Tab` again to see the updated
          category name without any loading state. React Suspense is excellent
          for UX.
        </p>
        <p class="my-4">
          The data created in this example are stored locally in SQLite. Evolu
          encrypts the data for backup and sync with a Mnemonic, a unique safe
          password created on your device.
        </p>
        <OwnerActions />
      </Suspense> 
      
    </EvoluContext.Provider>
  );
}

const NotificationBar: Component = () => {
  const evoluError = useEvoluError();
  const [showError, setShowError] = createSignal(!!evoluError());

  createEffect(() => {
    if (evoluError()) setShowError(true);
  });

  return (
    <Show when={evoluError() && showError()}>
      <div class="mt-3">
        <p>{`Error: ${JSON.stringify(evoluError())}`}</p>
        <Button
          title="Close"
          onClick={(): void => {
            setShowError(false);
          }}
        />
      </div>
    </Show>
  );
};

// Evolu queries should be collocated. If necessary, they can be preloaded.
const todosWithCategories = evolu.createQuery(
  (db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "categoryId"])
      .where("isDeleted", "is not", cast(true))
      // Filter null value and ensure non-null type.
      .where("title", "is not", null)
      .$narrowType<{ title: NotNull }>()
      .orderBy("createdAt")
      // https://kysely.dev/docs/recipes/relations
      .select((eb) => [
        jsonArrayFrom(
          eb
            .selectFrom("todoCategory")
            .select(["todoCategory.id", "todoCategory.name"])
            .where("isDeleted", "is not", cast(true))
            .orderBy("createdAt"),
        ).as("categories"),
      ]),
  {
    // logQueryExecutionTime: true,
    // logExplainQueryPlan: true,
  },
);

type TodosWithCategoriesRow = ExtractRow<typeof todosWithCategories>;

const Todos: Component = () => {
  const query = useQuery(todosWithCategories);
  const { create } = useEvolu<Database>();

  const handleAddTodoClick = (): void => {
    prompt(NonEmptyString1000, "What needs to be done?", (title) => {
      create("todo", { title });
    });
  };

  return (
    <>
      <ul class="py-2">
        {query().rows.map((row) => (
          <TodoItem row={row} />
        ))}
      </ul>
      <Button title="Add Todo" onClick={handleAddTodoClick} />
    </>
  );
};

const TodoItem: Component<{
  row: TodosWithCategoriesRow;
}> = ({ row: { id, title, isCompleted, categoryId, categories } }) => {
  const { update } = useEvolu<Database>();

  const handleToggleCompletedClick = (): void => {
    update("todo", { id, isCompleted: !isCompleted });
  };

  const handleRenameClick = (): void => {
    prompt(NonEmptyString1000, "New Name", (title) => {
      update("todo", { id, title });
    });
  };

  const handleDeleteClick = (): void => {
    update("todo", { id, isDeleted: true });
  };

  return (
    <li>
      <span class={`text-sm font-bold ${isCompleted ? "line-through" : ""}`}>
        {title}
      </span>
      <Button
        title={isCompleted ? "Completed" : "Complete"}
        onClick={handleToggleCompletedClick}
      />
      <Button title="Rename" onClick={handleRenameClick} />
      <Button title="Delete" onClick={handleDeleteClick} />
      <TodoCategorySelect
        categories={categories}
        selected={categoryId}
        onSelect={(categoryId): void => {
          update("todo", { id, categoryId });
        }}
      />
    </li>
  );
};

const TodoCategorySelect: Component<{
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
      onChange={({ target: { value } }): void => {
        onSelect(value === nothingSelected ? null : (value as TodoCategoryId));
      }}
    >
      <option value={nothingSelected}>-- no category --</option>
      {categories.map(({ id, name }) => (
        <option value={id}>{name}</option>
      ))}
    </select>
  );
};

const todoCategories = evolu.createQuery((db) =>
  db
    .selectFrom("todoCategory")
    .select(["id", "name", "json"])
    .where("isDeleted", "is not", cast(true))
    // Filter null value and ensure non-null type.
    .where("name", "is not", null)
    .$narrowType<{ name: NotNull }>()
    .orderBy("createdAt"),
);

type TodoCategoriesRow = ExtractRow<typeof todoCategories>;

const TodoCategories: Component = () => {
  const query = useQuery(todoCategories);
  const rows = query().rows;
  const { create } = useEvolu<Database>();

  // Evolu automatically parses JSONs into typed objects.
  // if (rows[0]) console.log(rows[1].json?.foo);

  const handleAddCategoryClick = (): void => {
    prompt(NonEmptyString50, "Category Name", (name) => {
      create("todoCategory", {
        name,
        json: { foo: "a", bar: false },
      });
    });
  };

  return (
    <>
      <ul class="py-2">
        {rows.map((row) => (
          <TodoCategoryItem row={row} />
        ))}
      </ul>
      <Button title="Add Category" onClick={handleAddCategoryClick} />
    </>
  );
};

const TodoCategoryItem: Component<{
  row: TodoCategoriesRow;
}> = ({ row: { id, name } }) => {
  const { update } = useEvolu<Database>();

  const handleRenameClick = (): void => {
    prompt(NonEmptyString50, "Category Name", (name) => {
      update("todoCategory", { id, name });
    });
  };

  const handleDeleteClick = (): void => {
    update("todoCategory", { id, isDeleted: true });
  };

  return (
    <>
      <li>
        <span class="text-sm font-bold">{name}</span>
        <Button title="Rename" onClick={handleRenameClick} />
        <Button title="Delete" onClick={handleDeleteClick} />
      </li>
    </>
  );
};

const OwnerActions: Component = () => {
  const evolu = useEvolu<Database>();
  const owner = useOwner();
  const [showMnemonic, setShowMnemonic] = createSignal(false);

  const handleRestoreOwnerClick = (): void => {
    prompt(NonEmptyString1000, "Your Mnemonic", (mnemonic) => {
      parseMnemonic(mnemonic)
        .pipe(Effect.runPromiseExit)
        .then(
          Exit.match({
            onFailure: (error) => {
              alert(JSON.stringify(error, null, 2));
            },
            onSuccess: (mnemonic) => {
              evolu.restoreOwner(mnemonic);
            },
          }),
        );
    });
  };

  const handleResetOwnerClick = (): void => {
    if (confirm("Are you sure? It will delete all your local data.")) {
      isRestoringOwner(false);
      evolu.resetOwner();
    }
  };

  return (
    <div class="mt-6">
      <p>
        Open this page on a different device and use your mnemonic to restore
        your data.
      </p>
      <Button
        title={`${showMnemonic() ? "Hide" : "Show"} Mnemonic`}
        onClick={(): void => {
          setShowMnemonic((current) => !current);
        }}
      />
      <Button title="Restore Owner" onClick={handleRestoreOwnerClick} />
      <Button title="Reset Owner" onClick={handleResetOwnerClick} />
      <Show when={!!owner()}>
        <div>
          <textarea
            value={owner()?.mnemonic}
            readOnly
            rows={2}
            style={{ width: "320px" }}
          />
        </div>
      </Show>
    </div>
  );
};

const Button: Component<{
  title: string;
  onClick: () => void;
}> = ({ title, onClick }) => {
  return (
    <button
      class="m-1 rounded-md border border-current px-1 text-sm active:opacity-80"
      onClick={onClick}
    >
      {title}
    </button>
  );
};

const prompt = <From extends string, To>(
  schema: S.Schema<To, From, never>,
  message: string,
  onSuccess: (value: To) => void,
): void => {
  const value = window.prompt(message);
  if (value == null) return; // on cancel
  const a = S.decodeUnknownEither(schema)(value);
  if (a._tag === "Left") {
    alert(formatError(a.left));
    return;
  }
  onSuccess(a.right);
};
