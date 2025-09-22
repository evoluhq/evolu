"use client";

import {
  binaryTimestampToTimestamp,
  createEvolu,
  createFormatTypeError,
  EvoluConfig,
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
  ValidMutationSizeError,
} from "@evolu/common";
import {
  createUseEvolu,
  EvoluProvider,
  useQuery,
  useWasSSR,
} from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";
import clsx from "clsx";
import {
  ChangeEvent,
  FC,
  startTransition,
  Suspense,
  use,
  useState,
} from "react";

// Evolu schema that describes the database tables and column types.

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

const config: EvoluConfig = {
  name: SimpleName.orThrow("evolu-nextjs-example-v200825"),

  reloadUrl: "/docs/examples/react/nextjs",

  ...(process.env.NODE_ENV === "development" && {
    transports: [{ type: "WebSocket", url: "http://localhost:4000" }],
  }),

  enableLogging: false,

  // Indexes are not required for development but are recommended for production.
  // https://www.evolu.dev/docs/indexes
  indexes: (create) => [
    create("todoCreatedAt").on("todo").column("createdAt"),
    create("todoCategoryCreatedAt").on("todoCategory").column("createdAt"),
  ],

  onMessage: (message) => {
    // eslint-disable-next-line no-console
    console.log("onMessage", { message });
    return Promise.resolve(true);
  },
};

const evolu = createEvolu(evoluReactWebDeps)(Schema, config);

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
  // eslint-disable-next-line no-console
  console.error(error);
});

export const NextJsExample: FC = () => {
  const [currentTab, setCurrentTab] = useState<"todos" | "categories">("todos");

  return (
    <div className="overflow-hidden rounded-lg bg-zinc-50 shadow-sm dark:bg-zinc-950">
      <div className="px-4 py-5 pt-0 sm:p-6 sm:pt-0">
        <EvoluProvider value={evolu}>
          <Tabs
            tabs={[
              {
                name: "Todos",
                onClick: () => {
                  startTransition(() => {
                    setCurrentTab("todos");
                  });
                },
                current: currentTab === "todos",
              },
              {
                name: "Categories",
                onClick: () => {
                  startTransition(() => {
                    setCurrentTab("categories");
                  });
                },
                current: currentTab === "categories",
              },
            ]}
          />
          <Suspense>
            {currentTab === "todos" ? <Todos /> : <TodoCategories />}
            <p className="my-4">
              The data created in this example are stored locally in SQLite.
              Evolu encrypts the data for backup and sync with a Mnemonic, a
              unique safe password created on your device.
            </p>
            <OwnerActions />
          </Suspense>
        </EvoluProvider>
      </div>
    </div>
  );
};

const Button: FC<{
  title: string;
  className?: string;
  onClick: () => void;
}> = ({ title, className, onClick }) => {
  return (
    <button
      className={clsx(
        "rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-zinc-900 shadow-xs ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50",
        className,
      )}
      onClick={onClick}
    >
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

    const result = insert("todo", {
      title,
      // This object is automatically converted to a JSON string.
      personJson: { name: "Joe", age: 32 },
    });

    if (!result.ok) {
      alert(formatTypeError(result.error));
    }

    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  return (
    <div className="">
      <ul className="py-2 pl-0">
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
    update("todo", { id, isCompleted: !isCompleted });
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
    update("todo", { id, isDeleted: true });
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
        timestamp: binaryTimestampToTimestamp(row.timestamp),
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
          <Button title="History" onClick={handleHistoryClick} />
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
      <ul className="py-2 pl-0">
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
    update("todoCategory", { id, isDeleted: true });
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

const Tabs: FC<{
  tabs: Array<{ name: string; onClick: () => void; current: boolean }>;
}> = ({ tabs }) => {
  return (
    <div>
      <div className="sm:hidden">
        <label htmlFor="tabs" className="sr-only">
          Select a tab
        </label>
        {/* Use an `onChange` listener to redirect the user to the selected tab URL. */}
        <select
          id="tabs"
          name="tabs"
          defaultValue={tabs.find((tab) => tab.current)?.name}
          className="block w-full rounded-md border-zinc-300 py-2 pr-10 pl-3 text-base focus:border-blue-500 focus:ring-blue-500 focus:outline-hidden sm:text-sm dark:border-zinc-800"
        >
          {tabs.map((tab) => (
            <option key={tab.name}>{tab.name}</option>
          ))}
        </select>
      </div>
      <div className="hidden sm:block">
        <div className="border-b border-zinc-200 dark:border-zinc-800">
          <nav aria-label="Tabs" className="-mb-px flex space-x-3">
            {tabs.map((tab) => (
              <button
                key={tab.name}
                // href={tab.href}
                onClick={tab.onClick}
                aria-current={tab.current ? "page" : undefined}
                className={[
                  tab.current
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300",
                  "border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap",
                ].join(" ")}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
};

const OwnerActions: FC = () => {
  const evolu = useEvolu();
  const [showMnemonic, setShowMnemonic] = useState(false);

  // evolu.appOwner is never resolved on the server.
  const wasSSR = useWasSSR();
  if (wasSSR) return null;

  const owner = use(evolu.appOwner);

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
    // TODO: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management#automatically_releasing_object_urls
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
      {showMnemonic && owner.mnemonic && (
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

/**
 * The `createFormatTypeError` function creates a unified error formatter that
 * handles both Evolu Type's built-in errors and custom errors. It also lets us
 * override the default formatting for specific errors.
 *
 * If you prefer not to reuse built-in error formatters, you can write your own
 * `formatTypeError` function from scratch. See the commented-out example at
 * the end of this file.
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

// // Note: We only need to specify the errors actually used in the app.
// type AppErrors =
//   | ValidMutationSizeError
//   | StringError
//   | MinLengthError
//   | MaxLengthError
//   | NullError
//   | IdError
//   | TrimmedError
//   | MnemonicError
//   | LiteralError
//   // Composite errors
//   | ObjectError<Record<string, AppErrors>>
//   | UnionError<AppErrors>;

// const formatTypeError: TypeErrorFormatter<AppErrors> = (error) => {
//   // In the real code, we would use the createTypeErrorFormatter helper
//   // that safely stringifies error value.
//   switch (error.type) {
//     case "Id":
//       return `Invalid Id on table: ${error.table}.`;
//     case "MaxLength":
//       return `Max length is ${error.max}.`;
//     case "MinLength":
//       return `Min length is ${error.min}.`;
//     case "Mnemonic":
//       return `Invalid mnemonic: ${String(error.value)}`;
//     case "Null":
//       return `Not null`;
//     case "String":
//       // We can reuse existing formatter.
//       return formatStringError(error);
//     case "Trimmed":
//       return "Value is not trimmed.";
//     case "ValidMutationSize":
//       return "A developer made an error, this should not happen.";
//     case "Literal":
//       return formatLiteralError(error);
//     // Composite Types
//     case "Union":
//       return `Union errors: ${error.errors.map(formatTypeError).join(", ")}`;
//     case "Object": {
//       if (
//         error.reason.kind === "ExtraKeys" ||
//         error.reason.kind === "NotObject"
//       )
//         return "A developer made an error, this should not happen.";
//       const firstError = Object.values(error.reason.errors).find(
//         (e) => e !== undefined,
//       )!;
//       return formatTypeError(firstError);
//     }
//   }
// };
