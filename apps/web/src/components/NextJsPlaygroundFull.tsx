"use client";

import {
  createEvolu,
  createFormatTypeError,
  FiniteNumber,
  id,
  idToIdBytes,
  json,
  kysely,
  maxLength,
  MaxLengthError,
  MinLengthError,
  Mnemonic,
  NonEmptyString,
  NonEmptyTrimmedString100,
  nullOr,
  object,
  SimpleName,
  SqliteBoolean,
  sqliteFalse,
  sqliteTrue,
  timestampBytesToTimestamp,
} from "@evolu/common";
import {
  createUseEvolu,
  EvoluProvider,
  useAppOwner,
  useQueries,
  useQuery,
} from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  IconChecklist,
  IconEdit,
  IconHistory,
  IconRestore,
  IconTrash,
} from "@tabler/icons-react";
import clsx from "clsx";
import { FC, KeyboardEvent, startTransition, Suspense, useState } from "react";

const ProjectId = id("Project");
type ProjectId = typeof ProjectId.Type;

const TodoId = id("Todo");
type TodoId = typeof TodoId.Type;

// A custom branded Type.
const NonEmptyString50 = maxLength(50)(NonEmptyString);
// string & Brand<"MinLength1"> & Brand<"MaxLength50">
type NonEmptyString50 = typeof NonEmptyString50.Type;

// SQLite supports JSON values.
// Use JSON for semi-structured data like API responses, external integrations,
// or when the schema varies by use case.
// Let's create an object to demonstrate it.
const Foo = object({
  foo: NonEmptyString50,
  // Did you know that JSON.stringify converts NaN (a number) into null?
  // To prevent this, use FiniteNumber.
  bar: FiniteNumber,
});
type Foo = typeof Foo.Type;

// SQLite stores JSON values as strings. Evolu provides a convenient `json`
// Type Factory for type-safe JSON serialization and parsing.
const [FooJson, fooToFooJson, fooJsonToFoo] = json(Foo, "FooJson");
// string & Brand<"FooJson">
type FooJson = typeof FooJson.Type;

const Schema = {
  project: {
    id: ProjectId,
    name: NonEmptyTrimmedString100,
    fooJson: FooJson,
  },
  todo: {
    id: TodoId,
    title: NonEmptyTrimmedString100,
    isCompleted: nullOr(SqliteBoolean),
    projectId: nullOr(ProjectId),
  },
};

const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  name: SimpleName.orThrow("evolu-playground-full"),

  reloadUrl: "/playgrounds/full",

  ...(process.env.NODE_ENV === "development" && {
    transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
    // transports: [],
  }),

  // https://www.evolu.dev/docs/indexes
  indexes: (create) => [
    create("todoCreatedAt").on("todo").column("createdAt"),
    create("projectCreatedAt").on("project").column("createdAt"),
    create("todoProjectId").on("todo").column("projectId"),
  ],

  enableLogging: false,
});

const useEvolu = createUseEvolu(evolu);

evolu.subscribeError(() => {
  const error = evolu.getError();
  if (!error) return;

  alert("🚨 Evolu error occurred! Check the console.");
  // eslint-disable-next-line no-console
  console.error(error);
});

export const NextJsPlaygroundFull: FC = () => {
  return (
    <div className="min-h-screen px-8 py-8">
      <div className="mx-auto max-w-md min-w-sm md:min-w-md">
        <EvoluProvider value={evolu}>
          <Suspense>
            <App />
          </Suspense>
        </EvoluProvider>
      </div>
    </div>
  );
};

const App: FC = () => {
  const [activeTab, setActiveTab] = useState<
    "home" | "projects" | "account" | "trash"
  >("home");

  const createHandleTabClick = (tab: typeof activeTab) => () => {
    // startTransition prevents UI flickers when switching tabs by keeping
    // the current view visible while Suspense prepares the next one
    // Test: Remove startTransition, add a todo, delete it, click to Trash.
    // You will see a visible blink without startTransition.
    startTransition(() => {
      setActiveTab(tab);
    });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between pb-4">
        <div className="flex w-full items-center justify-center gap-5 text-lg font-semibold">
          <button
            className={clsx(
              "cursor-pointer border-b-2 border-b-transparent whitespace-nowrap text-gray-500",
              activeTab === "home" && "!border-blue-600 !text-blue-600",
            )}
            onClick={createHandleTabClick("home")}
          >
            Home
          </button>
          <button
            className={clsx(
              "cursor-pointer border-b-2 border-b-transparent whitespace-nowrap text-gray-500",
              activeTab === "projects" && "!border-blue-600 !text-blue-600",
            )}
            onClick={createHandleTabClick("projects")}
          >
            Projects
          </button>
          <button
            className={clsx(
              "cursor-pointer border-b-2 border-b-transparent whitespace-nowrap text-gray-500",
              activeTab === "account" && "!border-blue-600 !text-blue-600",
            )}
            onClick={createHandleTabClick("account")}
          >
            Account
          </button>
          <button
            className={clsx(
              "cursor-pointer border-b-2 border-b-transparent whitespace-nowrap text-gray-500",
              activeTab === "trash" && "!border-blue-600 !text-blue-600",
            )}
            onClick={createHandleTabClick("trash")}
          >
            Trash
          </button>
        </div>
      </div>

      {activeTab === "home" && <HomeTab />}
      {activeTab === "projects" && <ProjectsTab />}
      {activeTab === "account" && <AccountTab />}
      {activeTab === "trash" && <TrashTab />}
    </div>
  );
};

const projectsWithTodosQuery = evolu.createQuery(
  (db) =>
    db
      .selectFrom("project")
      .select(["id", "name"])
      // https://kysely.dev/docs/recipes/relations
      .select((eb) => [
        kysely
          .jsonArrayFrom(
            eb
              .selectFrom("todo")
              .select([
                "todo.id",
                "todo.title",
                "todo.isCompleted",
                "todo.projectId",
              ])
              .whereRef("todo.projectId", "=", "project.id")
              .where("todo.isDeleted", "is not", sqliteTrue)
              .where("todo.title", "is not", null)
              .$narrowType<{ title: kysely.NotNull }>()
              .orderBy("createdAt"),
          )
          .as("todos"),
      ])
      .where("project.isDeleted", "is not", sqliteTrue)
      .where("name", "is not", null)
      .$narrowType<{ name: kysely.NotNull }>()
      .orderBy("createdAt"),
  {
    // Log how long each query execution takes
    logQueryExecutionTime: false,

    // Log the SQLite query execution plan for optimization analysis
    logExplainQueryPlan: false,
  },
);

type ProjectsWithTodosRow = typeof projectsWithTodosQuery.Row;

const HomeTab: FC = () => {
  const [projectsWithTodos, projects] = useQueries([
    projectsWithTodosQuery,
    /**
     * Load projects separately for better cache efficiency. Projects change
     * less frequently than todos, preventing unnecessary re-renders. Multiple
     * queries are fine in local-first - no network overhead.
     */
    projectsQuery,
  ]);

  const handleAddProjectClick = useAddProject();

  if (projectsWithTodos.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4 text-gray-700">
          <IconChecklist className="mx-auto h-12 w-12" />
        </div>
        <h3 className="mb-2 text-lg font-medium text-gray-900">
          No projects yet
        </h3>
        <p className="mb-6 text-gray-500">
          Create your first project to get started
        </p>
        <Button
          title="Add new project"
          onClick={handleAddProjectClick}
          variant="primary"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-8">
        {projectsWithTodos.map((project) => (
          <HomeTabProject
            key={project.id}
            project={project}
            todos={project.todos}
            projects={projects}
          />
        ))}
      </div>
    </div>
  );
};

const HomeTabProject: FC<{
  project: ProjectsWithTodosRow;
  todos: ProjectsWithTodosRow["todos"];
  projects: ReadonlyArray<ProjectsRow>;
}> = ({ project, todos, projects }) => {
  const { insert } = useEvolu();
  const [newTodoTitle, setNewTodoTitle] = useState("");

  const addTodo = () => {
    const result = insert(
      "todo",
      {
        title: newTodoTitle.trim(),
        projectId: project.id,
      },
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

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      addTodo();
    }
  };

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2">
        <h3 className="flex items-center gap-2 font-medium text-gray-900">
          <IconChecklist className="size-5 text-gray-500" />
          {project.name}
        </h3>
      </div>

      {todos.length > 0 && (
        <ol className="mb-4 space-y-2">
          {todos.map((todo) => (
            <HomeTabProjectSectionTodoItem
              key={todo.id}
              row={todo}
              projects={projects}
            />
          ))}
        </ol>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newTodoTitle}
          onChange={(e) => {
            setNewTodoTitle(e.target.value);
          }}
          data-1p-ignore // ignore this input from 1password, ugly hack but works
          onKeyDown={handleKeyPress}
          placeholder="Add a new todo..."
          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
        />
        <Button title="Add" onClick={addTodo} variant="primary" />
      </div>
    </div>
  );
};

const HomeTabProjectSectionTodoItem: FC<{
  // [number] extracts the element type from the todos array
  row: ProjectsWithTodosRow["todos"][number];
  projects: ReadonlyArray<ProjectsRow>;
}> = ({ row: { id, title, isCompleted, projectId }, projects }) => {
  const { update } = useEvolu();

  const handleToggleCompletedClick = () => {
    // No need to check result if a mutation can't fail.
    update("todo", {
      id,
      // Number converts boolean to number.
      isCompleted: Number(!isCompleted),
    });
  };

  const handleProjectChange = (newProjectId: ProjectId) => {
    update("todo", { id, projectId: newProjectId });
  };

  const handleRenameClick = () => {
    const newTitle = window.prompt("Edit todo", title);
    if (newTitle == null) return;

    const result = update("todo", { id, title: newTitle.trim() });
    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  const handleDeleteClick = () => {
    update("todo", { id, isDeleted: sqliteTrue });
  };

  // Demonstrate history tracking. Evolu automatically tracks all changes
  // in the evolu_history table, making it easy to build audit logs or undo features.
  const titleHistoryQuery = evolu.createQuery((db) =>
    db
      .selectFrom("evolu_history")
      .select(["value", "timestamp"])
      .where("table", "==", "todo")
      .where("id", "==", idToIdBytes(id))
      .where("column", "==", "title")
      // value isn't typed; this is how we narrow its type
      .$narrowType<{ value: (typeof Schema)["todo"]["title"]["Type"] }>()
      .orderBy("timestamp", "desc"),
  );

  const handleHistoryClick = () => {
    void evolu.loadQuery(titleHistoryQuery).then((rows) => {
      const rowsWithTimestamp = rows.map((row) => ({
        value: row.value,
        timestamp: timestampBytesToTimestamp(row.timestamp),
      }));
      alert(JSON.stringify(rowsWithTimestamp, null, 2));
    });
  };

  return (
    <li className="-mx-2 flex items-center gap-3 px-2 py-2 hover:bg-gray-50">
      <label className="flex flex-1 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={!!isCompleted}
          onChange={handleToggleCompletedClick}
          className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-blue-600 checked:bg-blue-600 indeterminate:border-blue-600 indeterminate:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"
        />
        <span className={clsx("flex-1 text-sm")}>{title}</span>
      </label>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <Menu as="div" className="relative">
            <MenuButton
              className="p-1 text-gray-400 transition-colors hover:text-blue-600"
              title="Change Project"
            >
              <IconChecklist className="size-4" />
            </MenuButton>
            <MenuItems
              transition
              className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg outline-1 outline-black/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
            >
              <div className="py-1">
                {projects.map((project) => (
                  <MenuItem key={project.id}>
                    <button
                      onClick={() => {
                        handleProjectChange(project.id);
                      }}
                      className={clsx(
                        "block w-full px-4 py-2 text-left text-sm data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden",
                        project.id === projectId
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-700",
                      )}
                    >
                      {project.name}
                    </button>
                  </MenuItem>
                ))}
              </div>
            </MenuItems>
          </Menu>
          <button
            onClick={handleRenameClick}
            className="p-1 text-gray-400 transition-colors hover:text-blue-600"
            title="Edit"
          >
            <IconEdit className="size-4" />
          </button>
          <button
            onClick={handleHistoryClick}
            className="p-1 text-gray-400 transition-colors hover:text-purple-600"
            title="View History"
          >
            <IconHistory className="size-4" />
          </button>
          <button
            onClick={handleDeleteClick}
            className="p-1 text-gray-400 transition-colors hover:text-red-600"
            title="Delete"
          >
            <IconTrash className="size-4" />
          </button>
        </div>
      </div>
    </li>
  );
};

const projectsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("project")
    .select(["id", "name", "fooJson"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("name", "is not", null)
    .$narrowType<{ name: kysely.NotNull }>()
    .where("fooJson", "is not", null)
    .$narrowType<{ fooJson: kysely.NotNull }>()
    .orderBy("createdAt"),
);

type ProjectsRow = typeof projectsQuery.Row;

const useAddProject = () => {
  const { insert } = useEvolu();

  return () => {
    const name = window.prompt("What's the project name?");
    if (name == null) return;

    // Demonstrate JSON usage.
    const foo = Foo.from({ foo: "baz", bar: 42 });
    if (!foo.ok) return;

    const result = insert("project", {
      name: name.trim(),
      fooJson: fooToFooJson(foo.value),
    });
    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };
};

const ProjectsTab: FC = () => {
  const projects = useQuery(projectsQuery);
  const handleAddProjectClick = useAddProject();

  return (
    <div>
      <div className="space-y-3">
        {projects.map((project) => (
          <ProjectsTabProjectItem key={project.id} project={project} />
        ))}
        <div className="flex justify-center pt-4">
          <Button
            title="Add new project"
            onClick={handleAddProjectClick}
            variant="primary"
            className="w-full py-3 !text-base font-semibold"
          />
        </div>
      </div>
    </div>
  );
};

const ProjectsTabProjectItem: FC<{
  project: ProjectsRow;
}> = ({ project }) => {
  const { update } = useEvolu();

  const handleRenameClick = () => {
    const newName = window.prompt("Edit project name", project.name);
    if (newName == null) return;

    const result = update("project", { id: project.id, name: newName.trim() });
    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  const handleDeleteClick = () => {
    if (confirm(`Are you sure you want to delete project "${project.name}"?`)) {
      /**
       * In a classic centralized client-server app, we would fetch all todos
       * for this project and delete them too. But that approach is wrong for
       * distributed eventually consistent systems for two reasons:
       *
       * 1. Sync overhead scales with todo count (a project with 10k todos would
       *    generate 10k sync messages instead of just 1 for the project)
       * 2. It wouldn't delete todos from other devices before they sync
       *
       * The correct approach for local-first systems: handle cascading logic in
       * the UI layer. Queries filter out deleted projects, so their todos
       * naturally become hidden. If a todo detail view is needed, it should
       * check whether its parent project was deleted.
       */
      update("project", {
        id: project.id,
        isDeleted: sqliteTrue,
      });
    }
  };

  // Demonstrate JSON deserialization. Because FooJson is a branded type,
  // we can safely deserialize without validation - TypeScript guarantees
  // only validated JSON strings can have the FooJson brand.
  const _foo = fooJsonToFoo(project.fooJson);

  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-1 items-center gap-3">
        <IconChecklist className="size-6 text-gray-500" />
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{project.name}</h3>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={handleRenameClick}
          className="p-2 text-gray-400 transition-colors hover:text-blue-600"
          title="Rename Project"
        >
          <IconEdit className="size-4" />
        </button>
        <button
          onClick={handleDeleteClick}
          className="p-2 text-gray-400 transition-colors hover:text-red-600"
          title="Delete Project"
        >
          <IconTrash className="size-4" />
        </button>
      </div>
    </div>
  );
};

const AccountTab: FC = () => {
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
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <p className="mb-4 text-sm text-gray-600">
        Todos are stored in local SQLite. When you sync across devices, your
        data is end-to-end encrypted using your mnemonic.
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
          <Button title="Reset All Data" onClick={handleResetAppOwnerClick} />
          <Button
            title="Download Backup"
            onClick={handleDownloadDatabaseClick}
          />
        </div>
      </div>
    </div>
  );
};

const deletedProjectsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("project")
    .select(["id", "name", "updatedAt"])
    .where("isDeleted", "is", sqliteTrue)
    .where("name", "is not", null)
    .$narrowType<{ name: kysely.NotNull }>()
    .orderBy("updatedAt", "desc"),
);

type DeletedProjectsRow = typeof deletedProjectsQuery.Row;

const deletedTodosQuery = evolu.createQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted", "projectId", "updatedAt"])
    .select((eb) => [
      kysely
        .jsonObjectFrom(
          eb
            .selectFrom("project")
            .select(["project.id", "project.name"])
            .where("project.isDeleted", "is not", sqliteTrue)
            .whereRef("project.id", "=", "todo.projectId")
            .where("project.name", "is not", null)
            .$narrowType<{ name: kysely.NotNull }>(),
        )
        .as("project"),
    ])
    .where("isDeleted", "is", sqliteTrue)
    .where("title", "is not", null)
    .$narrowType<{ title: kysely.NotNull }>()
    .orderBy("updatedAt", "desc"),
);

type DeletedTodosRow = typeof deletedTodosQuery.Row;

const TrashTab: FC = () => {
  const deletedProjects = useQuery(deletedProjectsQuery);
  const deletedTodos = useQuery(deletedTodosQuery);

  if (deletedProjects.length === 0 && deletedTodos.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4 text-gray-700">
          <IconTrash className="mx-auto h-12 w-12" />
        </div>
        <h3 className="mb-2 text-lg font-medium text-gray-900">
          Trash is empty
        </h3>
        <p className="text-gray-500">
          Deleted projects and todos will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {deletedProjects.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            Deleted Projects
          </h3>
          <div className="space-y-2">
            {deletedProjects.map((project) => (
              <TrashTabDeletedProjectItem key={project.id} project={project} />
            ))}
          </div>
        </div>
      )}

      {deletedTodos.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            Deleted Todos
          </h3>
          <div className="space-y-2">
            {deletedTodos.map((todo) => (
              <TrashTabDeletedTodoItem key={todo.id} todo={todo} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const TrashTabDeletedProjectItem: FC<{
  project: DeletedProjectsRow;
}> = ({ project }) => {
  const { update } = useEvolu();

  const handleRestoreClick = () => {
    if (
      confirm(`Are you sure you want to restore project "${project.name}"?`)
    ) {
      update("project", { id: project.id, isDeleted: sqliteFalse });
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-1 items-start gap-3">
        <IconChecklist className="size-6 text-gray-400" />
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{project.name}</h3>
          <p className="text-sm text-gray-500">
            Deleted{" "}
            {project.updatedAt
              ? new Date(project.updatedAt).toLocaleString()
              : "recently"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={handleRestoreClick}
          className="p-2 text-gray-400 transition-colors hover:text-green-600"
          title="Restore Project"
        >
          <IconRestore className="size-4" />
        </button>
      </div>
    </div>
  );
};

const TrashTabDeletedTodoItem: FC<{
  todo: DeletedTodosRow;
}> = ({ todo }) => {
  const { update } = useEvolu();

  const handleRestoreClick = () => {
    if (confirm(`Are you sure you want to restore todo "${todo.title}"?`)) {
      update("todo", { id: todo.id, isDeleted: sqliteFalse });
    }
  };

  const projectName = todo.project ? todo.project.name : "No Project";

  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-1 items-center gap-3">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{todo.title}</h3>
          <p className="text-sm text-gray-500">
            {projectName} • Deleted {new Date(todo.updatedAt).toLocaleString()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={handleRestoreClick}
          className="p-2 text-gray-400 transition-colors hover:text-green-600"
          title="Restore Todo"
        >
          <IconRestore className="size-4" />
        </button>
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

const formatTypeError = createFormatTypeError<MinLengthError | MaxLengthError>(
  (error): string => {
    switch (error.type) {
      case "MinLength":
        return `Text must be at least ${error.min} character${error.min === 1 ? "" : "s"} long`;
      case "MaxLength":
        return `Text is too long (maximum ${error.max} characters)`;
    }
  },
);
