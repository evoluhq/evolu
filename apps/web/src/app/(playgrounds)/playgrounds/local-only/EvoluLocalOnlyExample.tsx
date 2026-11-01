"use client";

import * as Evolu from "@evolu/common";
import { createEvoluBinding } from "@evolu/react";
import { createEvoluDeps } from "@evolu/react-web";
import { createRun } from "@evolu/web";
import { IconTrash } from "@tabler/icons-react";
import { clsx } from "clsx";
import { Suspense, use, useState, useSyncExternalStore, type FC } from "react";

const AppSchema = {
  todo: {
    id: Evolu.id("Todo"),
    title: Evolu.NonEmptyTrimmedString100,
    isCompleted: Evolu.nullOr(Evolu.SqliteBoolean),
  },
};

const createAppQuery = Evolu.createQueryBuilder(AppSchema);

const todosQuery = createAppQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted"])
    .where("isDeleted", "is not", Evolu.sqliteTrue)
    .where("title", "is not", null)
    .$narrowType<{ title: Evolu.KyselyNotNull }>()
    .orderBy("createdAt"),
);

type TodosRow = typeof todosQuery.Row;

const run = createRun(createEvoluDeps());

const { EvoluContext, useEvolu, useQuery } =
  createEvoluBinding<typeof AppSchema>();

export const EvoluLocalOnlyExample: FC = () => {
  // `evoluError` is shared by all Evolu instances created from these deps.
  const error = useSyncExternalStore(
    run.deps.evoluError.subscribe,
    run.deps.evoluError.get,
    Evolu.constNull,
  );

  return (
    <div className="min-h-screen px-8 py-8">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-center text-xl font-semibold text-gray-900">
          Local-Only Todo App
        </h1>

        <p className="mb-6 border-l-2 border-amber-400 pl-4 text-sm text-gray-600">
          This example keeps its data on this device only. It uses a shared test
          identity, whose key is public, so use only sample data.
        </p>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800"
          >
            Evolu error: {error.type}. See the console for details.
          </p>
        )}

        <Suspense>
          <App />
        </Suspense>
      </div>
    </div>
  );
};

const appPromise = run.ok(
  Evolu.createEvolu(AppSchema, {
    appName: Evolu.AppName.orThrow("local-only-example"),
    appOwner: Evolu.testAppOwner,
    // Without transports, nothing leaves this device. Sync can be added later
    // with `evolu.useOwner(evolu.appOwner, transports)`.
    transports: [],
  }),
);

const App: FC = () => (
  <EvoluContext value={use(appPromise)}>
    <DevicePersistenceNotice />
    <Todos />
    <DataActions />
  </EvoluContext>
);

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
      Your data isn&apos;t kept on this device, so it&apos;s lost when you close
      this tab.
    </p>
  );
};

const Todos: FC = () => {
  const todos = useQuery(todosQuery);

  const { insert } = useEvolu();
  const [newTodoTitle, setNewTodoTitle] = useState("");

  const addTodo = () => {
    const result = Evolu.NonEmptyTrimmedString100.fromUnknown(
      newTodoTitle.trim(),
    );
    if (!result.ok) {
      alert(Evolu.NonEmptyTrimmedString100.formatError(result.error));
      return;
    }

    insert(
      "todo",
      { title: result.value },
      {
        onComplete: () => {
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
}> = ({ row: { id, title, isCompleted } }) => {
  const { update } = useEvolu();

  const handleToggleCompletedClick = () => {
    update("todo", {
      id,
      isCompleted: Evolu.booleanToSqliteBoolean(!isCompleted),
    });
  };

  const handleDeleteClick = () => {
    update("todo", { id, isDeleted: Evolu.sqliteTrue });
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
      <button
        onClick={handleDeleteClick}
        className="p-1 text-gray-400 transition-colors hover:text-red-600"
        title="Delete"
      >
        <IconTrash className="size-4" />
      </button>
    </li>
  );
};

const DataActions: FC = () => {
  const evolu = useEvolu();

  const handleDownloadDatabaseClick = () => {
    void evolu
      .exportDatabase()
      .then((data: Uint8Array<ArrayBuffer>) => {
        using objectUrl = Evolu.createObjectURL(
          new Blob([data], { type: "application/x-sqlite3" }),
        );
        const link = document.createElement("a");
        link.href = objectUrl.url;
        link.download = `${evolu.name}.sqlite3`;
        link.click();
      })
      .catch((error: Evolu.EvoluDisposedError | Evolu.UnknownError) => {
        // A deletion disposed the instance first, and the app reloads.
        if (error.type === "EvoluDisposedError") return;
        alert(`Downloading the database failed: ${error.type}. Try again.`);
      });
  };

  const handleDeleteAllDataClick = () => {
    if (!confirm("Delete all data on this device? This can't be undone."))
      return;
    // On success, Evolu reloads every tab of the app, this one included,
    // because the example sets no onDatabaseDeleted.
    void evolu.deleteDatabase().then((result) => {
      // After an UnknownError, the instances keep working, and deleting again
      // deletes again. After a DatabaseHeldError, Evolu refuses the database
      // and reports it as evoluError, which the example shows.
      if (!result.ok && result.error.type === "UnknownError")
        alert("Deleting the data failed. Try again.");
    });
  };

  return (
    <div className="mt-8 rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-4 text-lg font-medium text-gray-900">Data</h2>
      <p className="mb-4 text-sm text-gray-600">
        Todos are stored in SQLite on this device and never leave it, so this is
        their only copy. Download the database to keep a plaintext copy that any
        SQLite tool can read; Evolu can&apos;t restore it. An app can add sync
        later, which then syncs the todos made before.
      </p>
      <p className="mb-4 text-sm text-gray-600">
        Deleting all data deletes the database in every tab of this app. Nothing
        syncs it back, so the app starts empty.
      </p>

      <div className="flex gap-2">
        <Button
          title="Download Database"
          onClick={handleDownloadDatabaseClick}
        />
        <Button title="Delete All Data" onClick={handleDeleteAllDataClick} />
      </div>
    </div>
  );
};

const Button: FC<{
  title: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}> = ({ title, onClick, variant = "secondary" }) => (
  <button
    className={clsx(
      "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      variant === "primary"
        ? "bg-blue-600 text-white hover:bg-blue-700"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200",
    )}
    onClick={onClick}
  >
    {title}
  </button>
);
