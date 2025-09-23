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
import { createUseEvolu, EvoluProvider, useQuery } from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  IconEdit,
  IconRestore,
  IconStackFront,
  IconTrash,
} from "@tabler/icons-react";
import clsx from "clsx";
import { FC, startTransition, Suspense, use, useState } from "react";

// Define the Evolu schema that describes the database tables and column types.
// First, define the typed IDs.

const ProjectId = id("Project");
type ProjectId = typeof ProjectId.Type;

const TodoId = id("Todo");
type TodoId = typeof TodoId.Type;

const Schema = {
  project: {
    id: ProjectId,
    name: NonEmptyString1000,
  },
  todo: {
    id: TodoId,
    title: NonEmptyString1000,
    // SQLite doesn't support the boolean type; it uses 0 (false) and 1 (true) instead.
    // SqliteBoolean provides seamless conversion.
    isCompleted: nullOr(SqliteBoolean),
    projectId: nullOr(ProjectId),
  },
};

const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  reloadUrl: "/playgrounds/full",
  name: SimpleName.orThrow("evolu-playground-full-v2"),

  ...(process.env.NODE_ENV === "development" && {
    transports: [{ type: "WebSocket", url: "http://localhost:4000" }],
    // transports: [],
  }),

  // Indexes are not required for development but are recommended for production.
  // https://www.evolu.dev/docs/indexes
  indexes: (create) => [
    create("todoCreatedAt").on("todo").column("createdAt"),
    create("projectCreatedAt").on("project").column("createdAt"),
    create("todoProjectId").on("todo").column("projectId"),
  ],

  enableLogging: true,
});

const useEvolu = createUseEvolu(evolu);

const projectsQuery = evolu.createQuery(
  (db) =>
    db
      .selectFrom("project")
      .select(["id", "name"])
      .where("isDeleted", "is not", 1)
      .where("name", "is not", null)
      .$narrowType<{ name: kysely.NotNull }>()
      .orderBy("createdAt"),
  {
    // logQueryExecutionTime: true,
    // logExplainQueryPlan: true,
  },
);

const todosWithProject = evolu.createQuery(
  (db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "projectId"])
      .where("isDeleted", "is not", 1)
      // Filter null value and ensure non-null type.
      .where("title", "is not", null)
      .$narrowType<{ title: kysely.NotNull }>()
      .orderBy("createdAt"),
  {
    // logQueryExecutionTime: true,
    // logExplainQueryPlan: true,
  },
);

const deletedProjectsQuery = evolu.createQuery(
  (db) =>
    db
      .selectFrom("project")
      .select(["id", "name", "updatedAt"])
      .where("isDeleted", "is", 1)
      .where("name", "is not", null)
      .$narrowType<{ name: kysely.NotNull }>()
      .orderBy("updatedAt", "desc"),
  {
    // logQueryExecutionTime: true,
    // logExplainQueryPlan: true,
  },
);

const deletedTodosQuery = evolu.createQuery(
  (db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "projectId", "updatedAt"])
      .where("isDeleted", "is", 1)
      .where("title", "is not", null)
      .$narrowType<{ title: kysely.NotNull }>()
      .orderBy("updatedAt", "desc"),
  {
    // logQueryExecutionTime: true,
    // logExplainQueryPlan: true,
  },
);

type ProjectsRow = typeof projectsQuery.Row;
type TodosWithProjectRow = typeof todosWithProject.Row;
type DeletedProjectsRow = typeof deletedProjectsQuery.Row;
type DeletedTodosRow = typeof deletedTodosQuery.Row;

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
            <AppShell />
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

const AppShell: FC = () => {
  const projects = useQuery(projectsQuery);
  const { insert } = useEvolu();

  const [activeTab, setActiveTab] = useState<
    "home" | "projects" | "dataManagement" | "trash"
  >("home");

  const handleAddProjectClick = () => {
    const name = window.prompt("What's the project name?");
    if (name == null) return; // escape or cancel

    const result = insert("project", {
      name,
    });

    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  if (projects.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4 text-gray-700">
          <IconStackFront className="mx-auto h-12 w-12" />
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
      <div className="mb-6 flex items-center justify-between pb-4">
        <div className="flex w-full items-center justify-center gap-5 text-lg font-semibold">
          <button
            className={clsx(
              "cursor-pointer border-b-2 border-b-transparent whitespace-nowrap text-gray-500",
              activeTab === "home" && "!border-blue-600 !text-blue-600",
            )}
            onClick={() => {
              startTransition(() => {
                setActiveTab("home");
              });
            }}
          >
            Home
          </button>
          <button
            className={clsx(
              "cursor-pointer border-b-2 border-b-transparent whitespace-nowrap text-gray-500",
              activeTab === "projects" && "!border-blue-600 !text-blue-600",
            )}
            onClick={() => {
              startTransition(() => {
                setActiveTab("projects");
              });
            }}
          >
            Projects
          </button>
          <button
            className={clsx(
              "cursor-pointer border-b-2 border-b-transparent whitespace-nowrap text-gray-500",
              activeTab === "dataManagement" &&
                "!border-blue-600 !text-blue-600",
            )}
            onClick={() => {
              startTransition(() => {
                setActiveTab("dataManagement");
              });
            }}
          >
            Account
          </button>
          <button
            className={clsx(
              "cursor-pointer border-b-2 border-b-transparent whitespace-nowrap text-gray-500",
              activeTab === "trash" && "!border-blue-600 !text-blue-600",
            )}
            onClick={() => {
              startTransition(() => {
                setActiveTab("trash");
              });
            }}
          >
            Trash
          </button>
        </div>
      </div>

      <Suspense>
        {activeTab === "home" && <ProjectsPage />}
        {activeTab === "projects" && <ProjectsTab />}
        {activeTab === "dataManagement" && <DataManagementTab />}
        {activeTab === "trash" && <TrashTab />}
      </Suspense>
    </div>
  );
};

const ProjectsTab: FC = () => {
  const projects = useQuery(projectsQuery);
  const { insert } = useEvolu();

  const handleAddProjectClick = () => {
    const name = window.prompt("What's the project name?");
    if (name == null) return; // escape or cancel

    const result = insert("project", {
      name,
    });

    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  return (
    <div>
      <div className="space-y-3">
        {projects.map((project) => (
          <ProjectItem key={project.id} project={project} />
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

const DataManagementTab: FC = () => {
  return (
    <div>
      <OwnerActions />
    </div>
  );
};

const TrashTab: FC = () => {
  const deletedProjects = useQuery(deletedProjectsQuery);
  const deletedTodos = useQuery(deletedTodosQuery);
  const projects = useQuery(projectsQuery); // For getting project names

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
              <DeletedProjectItem key={project.id} project={project} />
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
              <DeletedTodoItem
                key={todo.id}
                todo={todo}
                projects={[...projects]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const DeletedProjectItem: FC<{
  project: DeletedProjectsRow;
}> = ({ project }) => {
  const { update } = useEvolu();

  const handleRestoreClick = () => {
    if (
      confirm(`Are you sure you want to restore project "${project.name}"?`)
    ) {
      update("project", { id: project.id, isDeleted: false });
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-1 items-start gap-3">
        <IconStackFront className="size-6 text-gray-400" />
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

const DeletedTodoItem: FC<{
  todo: DeletedTodosRow;
  projects: Array<ProjectsRow>;
}> = ({ todo, projects }) => {
  const { update } = useEvolu();

  const handleRestoreClick = () => {
    if (confirm(`Are you sure you want to restore todo "${todo.title}"?`)) {
      update("todo", { id: todo.id, isDeleted: false });
    }
  };

  const getProjectName = (projectId: ProjectId | null) => {
    const project = projects.find((p) => p.id === projectId);
    return project ? project.name : "Unknown Project (Orphan)";
  };

  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-1 items-center gap-3">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{todo.title}</h3>
          <p className="text-sm text-gray-500">
            {getProjectName(todo.projectId)} • Deleted{" "}
            {todo.updatedAt
              ? new Date(todo.updatedAt).toLocaleString()
              : "recently"}
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

const ProjectsPage: FC = () => {
  const todos = useQuery(todosWithProject);
  const projects = useQuery(projectsQuery);

  const groupedTodos = todos.reduce<Record<string, Array<TodosWithProjectRow>>>(
    (acc, todo) => {
      const projectId = todo.projectId ?? "no-project";
      acc[projectId] = acc[projectId] ?? [];
      acc[projectId].push(todo);
      return acc;
    },
    {},
  );
  return (
    <div>
      <div className="flex flex-col gap-8">
        {projects.map((project) => (
          <ProjectSection
            key={project.id}
            project={project}
            todos={groupedTodos[project.id] ?? []}
          />
        ))}
      </div>
    </div>
  );
};

const ProjectSection: FC<{
  project: ProjectsRow;
  todos: Array<TodosWithProjectRow>;
}> = ({ project, todos }) => {
  const { insert } = useEvolu();
  const [newTodoTitle, setNewTodoTitle] = useState("");

  const handleAddTodo = () => {
    if (!newTodoTitle.trim()) return;

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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddTodo();
    }
  };

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2">
        <h3 className="flex items-center gap-2 font-medium text-gray-900">
          <IconStackFront className="size-5 text-gray-500" />
          {project.name}
        </h3>
      </div>

      {todos.length > 0 && (
        <div className="mb-4 space-y-2">
          {todos.map((todo) => (
            <TodoItem key={todo.id} row={todo} />
          ))}
        </div>
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
        <Button title="Add" onClick={handleAddTodo} variant="primary" />
      </div>
    </div>
  );
};

const ProjectItem: FC<{
  project: ProjectsRow;
}> = ({ project }) => {
  const { update } = useEvolu();

  const handleRenameClick = () => {
    const newName = window.prompt("Edit project name", project.name);
    if (newName == null) return; // escape or cancel
    const result = update("project", { id: project.id, name: newName });
    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  const handleDeleteClick = () => {
    if (confirm(`Are you sure you want to delete project "${project.name}"?`)) {
      update("project", { id: project.id, isDeleted: true });
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-1 items-center gap-3">
        <IconStackFront className="size-6 text-gray-500" />
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

const TodoItem: FC<{
  row: TodosWithProjectRow;
}> = ({ row: { id, title, isCompleted, projectId } }) => {
  const { update } = useEvolu();
  const projects = useQuery(projectsQuery);

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

  const handleProjectChange = (newProjectId: ProjectId | null) => {
    update("todo", { id, projectId: newProjectId });
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
              <IconStackFront className="size-4" />
            </MenuButton>
            <MenuItems
              transition
              className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg outline-1 outline-black/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
            >
              <div className="py-1">
                <MenuItem>
                  <button
                    onClick={() => {
                      handleProjectChange(null);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden"
                  >
                    No Project
                  </button>
                </MenuItem>
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

const OwnerActions: FC = () => {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
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

        {showMnemonic && owner.mnemonic && (
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
