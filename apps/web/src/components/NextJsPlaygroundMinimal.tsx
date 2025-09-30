"use client";

import {
  createEvolu,
  createFormatTypeError,
  id,
  kysely,
  MinLengthError,
  Mnemonic,
  NonEmptyString1000,
  nullOr,
  SimpleName,
  SqliteBoolean,
  ValidMutationSizeError,
} from "@evolu/common";
import {
  createUseEvolu,
  EvoluProvider,
  useAppOwner,
  useQuery,
} from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import clsx from "clsx";
import { FC, Suspense, useState } from "react";

// Define the Evolu schema that describes the database tables and column types.
// First, define the typed IDs.

const TodoId = id("Todo");
type TodoId = typeof TodoId.Type;

const Schema = {
  todo: {
    id: TodoId,
    title: NonEmptyString1000,
    // SQLite doesn't support the boolean type; it uses 0 (false) and 1 (true) instead.
    // SqliteBoolean provides seamless conversion.
    isCompleted: nullOr(SqliteBoolean),
  },
};

const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  reloadUrl: "/playgrounds/minimal",
  name: SimpleName.orThrow("evolu-playground-minimal-v2"),

  ...(process.env.NODE_ENV === "development" && {
    transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
    // transports: [],
  }),

  // Indexes are not required for development but are recommended for production.
  // https://www.evolu.dev/docs/indexes
  indexes: (create) => [create("todoCreatedAt").on("todo").column("createdAt")],

  enableLogging: true,

  onMessage: (_message) => {
    // message.
    return Promise.resolve(true);
  },
});

const useEvolu = createUseEvolu(evolu);

const todosQuery = evolu.createQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted"])
    .where("isDeleted", "is not", 1)
    // Filter null value and ensure non-null type.
    .where("title", "is not", null)
    .$narrowType<{ title: kysely.NotNull }>()
    .orderBy("createdAt"),
);

type TodosRow = typeof todosQuery.Row;

evolu.subscribeError(() => {
  const error = evolu.getError();
  if (!error) return;
  alert("🚨 Evolu error occurred! Check the console.");
  // eslint-disable-next-line no-console
  console.error(error);
});

export const NextJsPlaygroundMinimal: FC = () => {
  return (
    <div className="min-h-screen px-8 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-2 flex items-center justify-between pb-4">
          <h1 className="w-full text-center text-xl font-semibold text-gray-900">
            Minimal Todo App
          </h1>
        </div>

        <EvoluProvider value={evolu}>
          <Suspense>
            <Todos />
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

const Todos: FC = () => {
  const todos = useQuery(todosQuery);
  const { insert } = useEvolu();
  const [newTodoTitle, setNewTodoTitle] = useState("");

  const handleAddTodo = () => {
    if (!newTodoTitle.trim()) return;

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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddTodo();
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="mb-6 space-y-2">
        {todos.map((todo) => (
          <TodoItem key={todo.id} row={todo} />
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newTodoTitle}
          onChange={(e) => {
            setNewTodoTitle(e.target.value);
          }}
          onKeyDown={handleKeyPress}
          placeholder="Add a new todo..."
          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
        />
        <Button title="Add" onClick={handleAddTodo} variant="primary" />
      </div>
    </div>
  );
};

const TodoItem: FC<{
  row: TodosRow;
}> = ({ row: { id, title, isCompleted } }) => {
  const { update } = useEvolu();

  const handleToggleCompletedClick = () => {
    update("todo", { id, isCompleted: !isCompleted });
  };

  const handleRenameClick = () => {
    const newTitle = window.prompt("Edit todo", title);
    if (newTitle == null) return; // escape or cancel
    const result = update("todo", { id, title: newTitle });
    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  const handleDeleteClick = () => {
    update("todo", { id, isDeleted: true });
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
  const owner = useAppOwner();

  const [showMnemonic, setShowMnemonic] = useState(false);

  const handleRestoreAppOwnerClick = () => {
    const mnemonic = window.prompt("Enter your mnemonic to restore your data:");
    if (mnemonic == null) return;
    const result = Mnemonic.from(mnemonic.trim());
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
      const blob = new Blob([array.slice()], { type: "application/x-sqlite3" });
      const a = document.createElement("a");
      document.body.appendChild(a);
      a.href = window.URL.createObjectURL(blob);
      a.download = "todos.sqlite3";
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
    <div className="mt-8 rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-4 text-lg font-medium text-gray-900">Account</h2>
      <p className="mb-4 text-sm text-gray-600">
        Your todos are stored locally and encrypted. Use your mnemonic to sync
        across devices.
      </p>

      <div className="space-y-3">
        <Button
          title={`${showMnemonic ? "Hide" : "Show"} Mnemonic`}
          onClick={() => {
            setShowMnemonic(!showMnemonic);
          }}
          className="w-full"
        />

        {showMnemonic && owner?.mnemonic && (
          <div className="bg-gray-50 p-3">
            <label className="mb-2 block text-xs font-medium text-gray-700">
              Your Mnemonic (keep this safe!)
            </label>
            <textarea
              value={owner.mnemonic}
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
