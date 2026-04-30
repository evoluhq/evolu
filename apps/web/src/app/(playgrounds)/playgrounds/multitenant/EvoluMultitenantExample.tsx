"use client";

import * as Evolu from "@evolu/common";
import { createEvoluBinding, createRunBinding } from "@evolu/react";
import { createEvoluDeps, EvoluIdenticon } from "@evolu/react-web";
import { createRun } from "@evolu/web";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import { clsx } from "clsx";
import {
  Suspense,
  use,
  useEffect,
  useState,
  type FC,
  type PropsWithChildren,
} from "react";

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

const DeviceSchema = {
  _appOwner: {
    id: Evolu.OwnerId,
    secret: Evolu.OwnerSecret,
    lastOpenedAt: Evolu.DateIso,
  },
};

const createDeviceQuery = Evolu.createQueryBuilder(DeviceSchema);

const deviceAppOwnersQuery = createDeviceQuery((db) =>
  db
    .selectFrom("_appOwner")
    .select(["id", "secret", "lastOpenedAt"])
    .where("secret", "is not", null)
    .where("lastOpenedAt", "is not", null)
    .$narrowType<{
      secret: Evolu.KyselyNotNull;
      lastOpenedAt: Evolu.KyselyNotNull;
    }>()
    .orderBy("lastOpenedAt", "desc"),
);

type DeviceAppOwnersRow = typeof deviceAppOwnersQuery.Row;

// Create Run with dependencies for React Web.
const run = createRun(
  createEvoluDeps({
    console: Evolu.createConsole({
      level: "debug",
      formatter: Evolu.createConsoleFormatter()({
        timestampFormat: "relative",
      }),
    }),
  }),
);

/**
 * `evoluError` is shared by all Evolu instances. Subscribe once for user-facing
 * error messages. Logging is handled by platform `createRun` global error
 * handlers.
 */
run.deps.evoluError.subscribe(() => {
  const error = run.deps.evoluError.get();
  if (!error) return;

  alert("🚨 Evolu error occurred! Check the console.");
});

const { RunContext, useRun } = createRunBinding(run);
const device = createEvoluBinding(DeviceSchema);
const app = createEvoluBinding(AppSchema);

// Memory only for now, TODO: Use DeviceAppOwner.
const devicePromise = run.orThrow(
  Evolu.createEvolu(DeviceSchema, {
    appOwner: Evolu.testAppOwner,
    appName: Evolu.AppName.orThrow("device"),
    transports: [],
    memoryOnly: true,
  }),
);

export const EvoluMultitenantExample: FC = () => (
  <div className="min-h-screen px-8 py-8">
    <div className="mx-auto max-w-md">
      <div className="mb-2 flex items-center justify-between pb-4">
        <h1 className="w-full text-center text-xl font-semibold text-gray-900">
          Multitenant Todo App
        </h1>
      </div>

      <RunContext value={run}>
        <Suspense>
          <DeviceEvoluContext>
            <App />
          </DeviceEvoluContext>
        </Suspense>
      </RunContext>
    </div>
  </div>
);

const DeviceEvoluContext: FC<PropsWithChildren> = ({ children }) => {
  const deviceEvolu = use(devicePromise);

  return (
    <device.EvoluContext value={deviceEvolu}>{children}</device.EvoluContext>
  );
};

const App: FC = () => {
  const appOwners = device.useQuery(deviceAppOwnersQuery);
  const selectedAppOwnerSecret = appOwners.at(0)?.secret;
  const selectedAppOwner = selectedAppOwnerSecret
    ? Evolu.createAppOwner(selectedAppOwnerSecret)
    : null;

  return (
    <div className="space-y-4">
      <AppOwners appOwners={appOwners} selectedAppOwner={selectedAppOwner} />
      {selectedAppOwner && (
        <AppEvoluContext key={selectedAppOwner.id} appOwner={selectedAppOwner}>
          <Todos />
        </AppEvoluContext>
      )}
    </div>
  );
};

const AppOwners: FC<{
  appOwners: ReadonlyArray<DeviceAppOwnersRow>;
  selectedAppOwner: Evolu.AppOwner | null;
}> = ({ appOwners, selectedAppOwner }) => {
  const run = useRun();
  const evolu = device.useEvolu();
  const [shownMnemonicOwnerId, setShownMnemonicOwnerId] =
    useState<Evolu.OwnerId | null>(null);

  const upsertAppOwner = (secret: Evolu.OwnerSecret) => {
    const appOwner = Evolu.createAppOwner(secret);
    evolu.upsert("_appOwner", {
      id: appOwner.id,
      secret,
      lastOpenedAt: run.deps.time.nowDateIso(),
    });
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-4 text-lg font-medium text-gray-900">AppOwners</h2>

      <div className="mb-4 flex gap-2">
        <Button
          title="Create"
          onClick={() => {
            upsertAppOwner(Evolu.createOwnerSecret(run.deps));
          }}
          variant="primary"
        />
        <Button
          title="Restore"
          onClick={() => {
            const mnemonic = window.prompt(
              "Enter your mnemonic to restore your data:",
            );
            if (mnemonic == null) return;

            const result = Evolu.Mnemonic.from(mnemonic.trim());
            if (!result.ok) {
              alert(formatTypeError(result.error));
              return;
            }

            upsertAppOwner(Evolu.mnemonicToOwnerSecret(result.value));
          }}
        />
      </div>

      <ol className="space-y-2">
        {appOwners.map((row) => (
          <AppOwnersItem
            key={row.id}
            row={row}
            isSelected={selectedAppOwner?.id === row.id}
            onSelect={() => {
              upsertAppOwner(row.secret);
            }}
            onDelete={() => {
              if (!confirm(`Delete stored AppOwner ${row.id}?`)) return;

              evolu.update("_appOwner", {
                id: row.id,
                isDeleted: Evolu.sqliteTrue,
              });
            }}
          />
        ))}
      </ol>

      <div className="mt-6 rounded-lg bg-gray-50 p-4 ring-1 ring-gray-200">
        <h3 className="mb-4 text-base font-medium text-gray-900">
          Selected AppOwner
        </h3>

        {selectedAppOwner ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <EvoluIdenticon id={selectedAppOwner.id} size={40} />
              <div>
                <div className="font-mono text-sm text-gray-900">
                  {selectedAppOwner.id}
                </div>
                <div className="text-sm text-gray-500">App is open.</div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="text-sm font-medium text-gray-900">Mnemonic</h4>
                <button
                  onClick={() => {
                    setShownMnemonicOwnerId(
                      shownMnemonicOwnerId === selectedAppOwner.id
                        ? null
                        : selectedAppOwner.id,
                    );
                  }}
                  className="rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
                >
                  {shownMnemonicOwnerId === selectedAppOwner.id
                    ? "Hide"
                    : "Show"}
                </button>
              </div>
              {shownMnemonicOwnerId === selectedAppOwner.id && (
                <p className="rounded-md bg-white p-3 font-mono text-xs leading-5 wrap-break-word text-gray-900 ring-1 ring-gray-200">
                  {selectedAppOwner.mnemonic}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            Create, restore, or select an AppOwner.
          </p>
        )}
      </div>
    </div>
  );
};

const AppOwnersItem: FC<{
  row: DeviceAppOwnersRow;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ row, isSelected, onSelect, onDelete }) => (
  <li
    className={clsx(
      "flex items-center justify-between rounded-lg border px-3 py-3",
      isSelected ? "border-blue-300 bg-blue-50" : "border-gray-200",
    )}
  >
    <div className="flex items-center gap-3">
      <EvoluIdenticon id={row.id} size={36} />
      <div>
        <div className="font-mono text-sm text-gray-900">{row.id}</div>
        <div className="text-xs text-gray-500">
          Last opened {new globalThis.Date(row.lastOpenedAt).toLocaleString()}
        </div>
      </div>
    </div>

    <div className="flex gap-2">
      {!isSelected && (
        <Button title="Select" onClick={onSelect} variant="primary" />
      )}
      <button
        onClick={onDelete}
        className="p-2 text-gray-400 transition-colors hover:text-red-600"
        title="Delete"
      >
        <IconTrash className="size-4" />
      </button>
    </div>
  </li>
);

const AppEvoluContext: FC<
  PropsWithChildren<{ readonly appOwner: Evolu.AppOwner }>
> = ({ appOwner, children }) => {
  const run = useRun();
  const [appEvolu, setAppEvolu] = useState<Evolu.Evolu<
    typeof AppSchema
  > | null>(null);

  useEffect(() => {
    const disposer = new AsyncDisposableStack();
    const effectRun = disposer.use(run.create());

    void effectRun(async (run) => {
      const instance = await run(
        Evolu.createEvolu(AppSchema, {
          appName: Evolu.AppName.orThrow("minimal-example"),
          appOwner,

          ...(process.env.NODE_ENV === "development" && {
            transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
          }),
        }),
      );
      if (!instance.ok) return instance;
      disposer.use(instance.value);
      setAppEvolu(instance.value);
      return Evolu.ok();
    });

    return () => {
      void disposer.disposeAsync();
    };
  }, [appOwner, run]);

  if (!appEvolu) return <AppLoading />;

  return (
    <app.EvoluContext value={appEvolu}>
      <Suspense fallback={<AppLoading />}>{children}</Suspense>
    </app.EvoluContext>
  );
};

const AppLoading: FC = () => (
  <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
    <p className="text-sm text-gray-600">Opening app...</p>
  </div>
);

/** Trims user input and validates it as a todo title. */
const parseTodoTitle = (value: string) =>
  Evolu.NonEmptyTrimmedString100.from(value.trim());

const Todos: FC = () => {
  // useQuery returns live data - component re-renders when data changes.
  const todos = app.useQuery(todosQuery);

  const { insert } = app.useEvolu();
  const [newTodoTitle, setNewTodoTitle] = useState("");

  const addTodo = () => {
    const result = parseTodoTitle(newTodoTitle);
    if (!result.ok) {
      alert(formatTypeError(result.error));
      return;
    }

    insert(
      "todo",
      {
        title: result.value,
      },
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
  const { update } = app.useEvolu();

  const handleToggleCompletedClick = () => {
    update("todo", {
      id,
      isCompleted: Evolu.booleanToSqliteBoolean(!isCompleted),
    });
  };

  const handleRenameClick = () => {
    const newTitle = window.prompt("Edit todo", title);
    if (newTitle == null) return;

    const result = parseTodoTitle(newTitle);
    if (!result.ok) {
      alert(formatTypeError(result.error));
      return;
    }

    update("todo", { id, title: result.value });
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
