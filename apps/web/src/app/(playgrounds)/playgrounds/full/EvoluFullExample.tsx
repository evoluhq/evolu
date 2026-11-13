"use client";

import {
  booleanToSqliteBoolean,
  constNull,
  createConsole,
  createConsoleFormatter,
  createEvoluApp,
  createObjectURL,
  createAppOwner,
  createOwnerSecret,
  createOwnerWebSocketTransport,
  createQueryBuilder,
  err,
  evoluJsonArrayFrom,
  evoluJsonObjectFrom,
  FiniteNumber,
  id,
  json,
  maxLength,
  Mnemonic,
  mnemonicToOwnerSecret,
  NonEmptyTrimmedString,
  NonEmptyTrimmedString100,
  nullOr,
  object,
  ok,
  RelayUrlFromString,
  SqliteBoolean,
  sqliteFalse,
  sqliteTrue,
  union,
  type AppName,
  type EvoluApp,
  type EvoluAppAuth,
  type EvoluDisposedError,
  type EvoluError,
  type InferType,
  type KyselyNotNull,
  type Millis,
  type OwnerId,
  type OwnerSecret,
  type RelayUrl,
  type Result,
  type TypeError,
  type Typed,
  type UnknownError,
} from "@evolu/common";
import {
  relaySyncStateToStatus,
  syncStateToOwnerSyncStatus,
  syncStateToRelaySyncStates,
  type OwnerSyncStatus,
  type RelaySyncState,
  type SyncConnection,
} from "@evolu/common/local-first";
import { createEvoluBinding } from "@evolu/react";
import { createEvoluDeps, EvoluIdenticon } from "@evolu/react-web";
import { createRun } from "@evolu/web";
import {
  Component,
  startTransition,
  Suspense,
  use,
  useState,
  useSyncExternalStore,
  type FC,
  type ReactNode,
} from "react";

// The playground's two variants, instant start and passkey, share these
// components and differ only in how they start: see instant/InstantStartExample.tsx
// and passkey/PasskeyExample.tsx. The React examples are this app without the
// playground's extras: the JSON column, the priority column, and adding relays.

const ProjectId = id("Project");
type ProjectId = typeof ProjectId.Output;

const TodoId = id("Todo");

// A custom branded Type.
const NonEmptyString50 = maxLength(50)(NonEmptyTrimmedString);

// SQLite supports JSON values. Use JSON for semi-structured data like API
// responses, external integrations, or when the schema varies by use case.
const Foo = object({
  foo: NonEmptyString50,
  // JSON.stringify converts NaN, a number, into null. FiniteNumber prevents it.
  bar: FiniteNumber,
});
interface Foo extends InferType<typeof Foo> {}

// SQLite stores JSON values as strings. The `json` Type Factory serializes and
// parses them type-safely.
const [FooJson, fooToFooJson, fooJsonToFoo] = json(Foo, "FooJson");

// An enum-like column: a union of literals, validated like any other Type.
const Priority = union("low", "high");

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
    projectId: ProjectId,
    priority: nullOr(Priority),
  },
};

const createQuery = createQueryBuilder(Schema);

export const run = /*#__PURE__*/ createRun(
  /*#__PURE__*/ createEvoluDeps({
    console: /*#__PURE__*/ createConsole({
      // Debug entries include OwnerIds, which are secret to all but their
      // relays, so only development logs them.
      level: process.env.NODE_ENV === "development" ? "debug" : "log",
      formatter: /*#__PURE__*/ createConsoleFormatter()({
        timestampFormat: "relative",
      }),
    }),
  }),
);

const {
  EvoluAppProvider,
  useAppOwners,
  useEvolu,
  useEvoluApp,
  useOwner,
  useOwnerSyncStatus,
  useQuery,
  useQueries,
} = createEvoluBinding<typeof Schema>();

export type App = EvoluApp<typeof Schema>;

// The relay in the app's config, which the e2e tests replace.
const configRelayUrl = RelayUrlFromString.orThrow(
  process.env.NEXT_PUBLIC_EVOLU_RELAY_URL ??
    (process.env.NODE_ENV === "development"
      ? "ws://localhost:4000"
      : "wss://free.evoluhq.com"),
);

/**
 * Evolu creates the app's AppOwners, keeps them on this device, and opens the
 * one opened last. The auth mode is fixed per `appName`, because each one opens
 * another device database.
 */
export const createApp = ({
  appName,
  auth,
  createFirstAppOwner,
}: {
  appName: AppName;
  auth: EvoluAppAuth;
  createFirstAppOwner: boolean;
}): Promise<App> =>
  run.orThrow(
    createEvoluApp(Schema, {
      appName,
      auth,
      createFirstAppOwner,

      // `transports: []` keeps everything on this device. Sync can be added
      // later with `evolu.useOwner(evolu.appOwner, transports)`, which syncs
      // the data made before.
      transports: [{ type: "WebSocket", url: configRelayUrl }],

      // https://www.evolu.dev/docs/indexes
      indexes: (create) => [
        create("todoCreatedAt").on("todo").column("createdAt"),
        create("projectCreatedAt").on("project").column("createdAt"),
        create("todoProjectId").on("todo").column("projectId"),
      ],
    }),
  );

/**
 * The page around the app. `evoluError` and the startup error stay outside the
 * Suspense boundary, so they show while the app waits for another build and
 * when it fails to start.
 */
export const ExampleShell: FC<{ intro: ReactNode; children: ReactNode }> = ({
  intro,
  children,
}) => {
  // Shared by all Evolu instances created from these deps.
  const error = useSyncExternalStore(
    run.deps.evoluError.subscribe,
    run.deps.evoluError.get,
    constNull,
  );

  return (
    // The website's dark mode would make text without its own color white,
    // such as the selects', and native controls dark, on this light page.
    <div className="min-h-screen px-4 py-8 text-gray-900 scheme-light sm:px-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 border-l-2 border-amber-400 pl-4 text-sm text-gray-600">
          {intro}
        </div>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800"
          >
            {evoluErrorToMessage(error)}
          </p>
        )}
        <ErrorBoundary
          fallback={
            <Card>
              <p className="mb-4 text-sm text-gray-600">
                The app couldn&apos;t start. See the console for details.
              </p>
              <Button
                title="Reload"
                variant="primary"
                onClick={() => {
                  location.reload();
                }}
              />
            </Card>
          }
        >
          <Suspense
            fallback={<p className="text-sm text-gray-600">Opening…</p>}
          >
            {children}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
};

/** What the user can do about an `evoluError`; see `EvoluError`. */
const evoluErrorToMessage = (error: EvoluError): string => {
  switch (error.type) {
    case "OtherBuildRunningError":
      return "Another version of this app is open in another tab. Close it to continue.";
    case "UnsupportedDbVersionError":
      return "Your data needs a newer version of this app. Close all its tabs and open it again.";
    case "DatabaseHeldError":
      return "Another tab or window holds your data. Close the app's other tabs, or restart the browser, then reload.";
    case "UnknownError":
      return "Something went wrong. Close all tabs of this app and open it again. See the console for details.";
  }
};

/**
 * Renders `fallback` instead of its children once one of them throws, which
 * React logs, rather than unmounting the page. The page's boundary shows a
 * failed start, such as a refused database; each tab's data has a boundary of
 * its own, so a failing query never reaches it. React has no hook for an error
 * boundary, so it's a class.
 */
class ErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The app once it started. The tabs load under a Suspense boundary, and each
 * tab's data under an error boundary of its own, with the tab bar inside the
 * Suspense boundary and outside the error boundaries, and the accounts and
 * relays sections outside both. A query SQLite fails throws, such as on a
 * corrupt page, and the user can still switch tabs. A refused database keeps
 * its queries pending, and the user can still open, add, or remove an account,
 * or delete this one's local data. Opening another AppOwner remounts these
 * children, which resets the error boundaries. Opening this one again reuses
 * its instance, whose failed query fails again until a mutation or sync
 * refreshes it, while deleting its local data opens a new instance.
 */
export const AppView: FC<{ app: Promise<App> }> = ({ app }) => (
  <EvoluAppProvider value={app} withoutAppOwner={<WithoutAppOwner />}>
    <SyncStatus />
    <Suspense fallback={<p className="text-sm text-gray-600">Loading…</p>}>
      <DevicePersistenceNotice />
      <Tabs />
    </Suspense>
    <Accounts />
    <Relays />
  </EvoluAppProvider>
);

/**
 * Shown while this tab has no AppOwner open: at the first start of an app that
 * starts with a choice, and after the open one's removal.
 */
const WithoutAppOwner: FC = () => (
  <Section title="Accounts">
    <p className="mb-4 text-sm text-gray-600">
      No account is open on this device.
    </p>
    <AppOwnerList openId={null} />
    <AddAppOwnerButtons />
  </Section>
);

/**
 * Tells the user when changes can't leave this device, and shows nothing while
 * sync works. See `OwnerSyncStatus` in `@evolu/common/local-first`.
 */
const SyncStatus: FC = () => {
  // Sync state is shared by every Evolu instance created from these deps, so
  // the hook takes its store and finds this database's AppOwner in it.
  const status = useOwnerSyncStatus(run.deps.syncState);
  // An app that sells relay quota offers more for a ProtocolQuotaError, then
  // calls `evolu.requestSync(evolu.appOwner.id)`.
  const message =
    status.type === "Disconnected"
      ? "Can't reach the sync server. Changes will sync once the connection is back."
      : status.type === "Error"
        ? status.error.type === "ProtocolQuotaError"
          ? "Sync is paused because the sync server is full."
          : `Sync error: ${status.error.type}.`
        : null;

  return (
    // Always mounted: screen readers announce changes only in a live region
    // that already exists.
    <div role="status">
      {message && <p className="mb-4 text-sm text-gray-600">{message}</p>}
    </div>
  );
};

/**
 * Tells the user when this device doesn't keep their data, as in Safari's
 * Private Browsing or a Firefox private window. See `DevicePersistence` in
 * `@evolu/common/local-first`.
 */
const DevicePersistenceNotice: FC = () => {
  const devicePersistence = use(useEvolu().devicePersistence);
  if (devicePersistence !== "NotPersisted") return null;
  return (
    <p className="mb-4 text-sm text-gray-600">
      Your data isn&apos;t kept on this device. Changes that haven&apos;t synced
      are lost when you close this tab.
    </p>
  );
};

type Tab = "home" | "projects" | "trash";

const Tabs: FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("home");

  const tabButton = (tab: Tab, title: string) => (
    <button
      className={`cursor-pointer border-b-2 whitespace-nowrap ${
        activeTab === tab
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-gray-500"
      }`}
      onClick={() => {
        // Keeps the current tab visible while Suspense loads the next one's
        // queries, instead of showing the fallback.
        startTransition(() => {
          setActiveTab(tab);
        });
      }}
    >
      {title}
    </button>
  );

  return (
    <div className="mb-8">
      <div className="mb-6 flex items-center justify-center gap-5 pb-4 text-lg font-semibold">
        {tabButton("home", "Home")}
        {tabButton("projects", "Projects")}
        {tabButton("trash", "Trash")}
      </div>
      {/* Keyed by the tab, so switching tabs resets it. */}
      <ErrorBoundary
        key={activeTab}
        fallback={
          <p role="alert" className="text-sm text-red-800">
            This tab&apos;s data couldn&apos;t load. See the console for
            details. Reloading the page tries again, and the other tabs and
            accounts stay available.
          </p>
        }
      >
        {activeTab === "home" && <HomeTab />}
        {activeTab === "projects" && <ProjectsTab />}
        {activeTab === "trash" && <TrashTab />}
      </ErrorBoundary>
    </div>
  );
};

// Projects with their todos nested, one query for the whole Home tab. Evolu
// uses Kysely, a query builder, not an ORM: https://kysely.dev/docs/recipes/relations
const projectsWithTodosQuery = createQuery(
  (db) =>
    db
      .selectFrom("project")
      .select(["id", "name"])
      .select((eb) => [
        evoluJsonArrayFrom(
          eb
            .selectFrom("todo")
            .select([
              "todo.id",
              "todo.title",
              "todo.isCompleted",
              "todo.priority",
            ])
            .whereRef("todo.projectId", "=", "project.id")
            .where("todo.isDeleted", "is not", sqliteTrue)
            .where("todo.title", "is not", null)
            .$narrowType<{ title: KyselyNotNull }>()
            .orderBy("createdAt"),
        ).as("todos"),
      ])
      // Soft delete: deleted rows stay, so their deletion syncs.
      .where("project.isDeleted", "is not", sqliteTrue)
      // All columns except id are nullable in queries, so the schema can evolve
      // without migrations. Filter nulls with where and $narrowType.
      .where("name", "is not", null)
      .$narrowType<{ name: KyselyNotNull }>()
      // createdAt, updatedAt, and isDeleted are added to every table.
      .orderBy("createdAt"),
  {
    // Logs how long each run of the query takes.
    logQueryExecutionTime: false,
    // Logs SQLite's query plan, which shows whether an index is used.
    logExplainQueryPlan: false,
  },
);

type ProjectsWithTodosRow = typeof projectsWithTodosQuery.Row;

const projectsQuery = createQuery((db) =>
  db
    .selectFrom("project")
    .select(["id", "name", "fooJson"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("name", "is not", null)
    .$narrowType<{ name: KyselyNotNull }>()
    .where("fooJson", "is not", null)
    .$narrowType<{ fooJson: KyselyNotNull }>()
    .orderBy("createdAt"),
);

type ProjectsRow = typeof projectsQuery.Row;

const HomeTab: FC = () => {
  const [projectsWithTodos, projects] = useQueries([
    projectsWithTodosQuery,
    // The projects for moving a todo. Separate queries are cheap in
    // local-first, and this one changes less often than the todos.
    projectsQuery,
  ]);
  const addProject = useAddProject();

  if (projectsWithTodos.length === 0)
    return (
      <div className="py-12 text-center">
        <h3 className="mb-2 text-lg font-medium text-gray-900">
          No projects yet
        </h3>
        <p className="mb-6 text-gray-500">
          Create your first project to get started
        </p>
        <Button title="Add Project" onClick={addProject} variant="primary" />
      </div>
    );

  return (
    <div className="flex flex-col gap-8">
      {projectsWithTodos.map((project) => (
        <ProjectTodos key={project.id} project={project} projects={projects} />
      ))}
    </div>
  );
};

const ProjectTodos: FC<{
  project: ProjectsWithTodosRow;
  projects: ReadonlyArray<ProjectsRow>;
}> = ({ project, projects }) => {
  const { insert } = useEvolu();
  const [newTodoTitle, setNewTodoTitle] = useState("");

  const addTodo = () => {
    const title = parseStringWithAlert(NonEmptyTrimmedString100, newTodoTitle);
    if (!title.ok) return;
    insert(
      "todo",
      { title: title.value, projectId: project.id },
      {
        onSuccess: () => {
          setNewTodoTitle("");
        },
      },
    );
  };

  return (
    <Card>
      <h3 className="mb-3 border-b border-gray-100 pb-2 font-medium text-gray-900">
        {project.name}
      </h3>
      {project.todos.length > 0 && (
        <ol aria-label={`${project.name} todos`} className="mb-4 space-y-2">
          {project.todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              projectId={project.id}
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
          onKeyDown={(e) => {
            if (e.key === "Enter") addTodo();
          }}
          aria-label={`New todo in ${project.name}`}
          // 1Password offers to fill any text input, which this opts out of.
          data-1p-ignore
          placeholder="Add a new todo..."
          className={inputClassName}
        />
        <Button title="Add" onClick={addTodo} variant="primary" />
      </div>
    </Card>
  );
};

const TodoItem: FC<{
  todo: ProjectsWithTodosRow["todos"][number];
  projectId: ProjectId;
  projects: ReadonlyArray<ProjectsRow>;
}> = ({ todo: { id, title, isCompleted, priority }, projectId, projects }) => {
  const { update } = useEvolu();

  return (
    <li className="flex items-center gap-2">
      <label className="flex flex-1 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={!!isCompleted}
          onChange={() => {
            // A mutation that can't fail needs no result check.
            update("todo", {
              id,
              isCompleted: booleanToSqliteBoolean(!isCompleted),
            });
          }}
        />
        <span
          className={`text-sm ${isCompleted ? "text-gray-500 line-through" : "text-gray-900"}`}
        >
          {title}
        </span>
      </label>
      <select
        aria-label="Priority"
        value={priority ?? ""}
        onChange={(e) => {
          const newPriority =
            e.target.value === ""
              ? ok(null)
              : Priority.fromUnknown(e.target.value);
          if (newPriority.ok)
            update("todo", { id, priority: newPriority.value });
        }}
        className="rounded-md border-gray-300 py-1 text-xs"
      >
        <option value="">No priority</option>
        {Priority.members.map(({ expected }) => (
          <option key={expected} value={expected}>
            {expected}
          </option>
        ))}
      </select>
      <select
        aria-label="Project"
        value={projectId}
        onChange={(e) => {
          // The options are the projects' IDs, which the select reads as
          // strings.
          const newProjectId = ProjectId.fromUnknown(e.target.value);
          if (newProjectId.ok)
            update("todo", { id, projectId: newProjectId.value });
        }}
        className="max-w-28 rounded-md border-gray-300 py-1 text-xs"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <TextButton
        title="Edit"
        onClick={() => {
          const newTitle = promptStringWithAlert(
            "Edit todo",
            NonEmptyTrimmedString100,
            title,
          );
          if (newTitle.ok) update("todo", { id, title: newTitle.value });
        }}
      />
      <TextButton
        title="Delete"
        onClick={() => {
          update("todo", { id, isDeleted: sqliteTrue });
        }}
      />
    </li>
  );
};

const ProjectsTab: FC = () => {
  const projects = useQuery(projectsQuery);
  const addProject = useAddProject();

  return (
    <div className="space-y-3">
      <ul aria-label="Projects" className="space-y-3">
        {projects.map((project) => (
          <ProjectItem key={project.id} project={project} />
        ))}
      </ul>
      <Button
        title="Add Project"
        onClick={addProject}
        variant="primary"
        className="w-full"
      />
    </div>
  );
};

const useAddProject = () => {
  const { insert } = useEvolu();

  return () => {
    const name = promptStringWithAlert(
      "What's the project name?",
      NonEmptyTrimmedString100,
    );
    if (!name.ok) return;
    insert("project", {
      name: name.value,
      fooJson: fooToFooJson({
        foo: NonEmptyString50.orThrow("baz"),
        bar: FiniteNumber.orThrow(42),
      }),
    });
  };
};

const ProjectItem: FC<{ project: ProjectsRow }> = ({ project }) => {
  const { update } = useEvolu();

  // FooJson is branded, so only validated JSON has it, and it parses without
  // validation.
  const foo = fooJsonToFoo(project.fooJson);

  return (
    <li>
      <Card className="flex items-center gap-3">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{project.name}</h3>
          <p className="text-xs text-gray-500">
            JSON: {foo.foo} {foo.bar}
          </p>
        </div>
        <TextButton
          title="Rename"
          onClick={() => {
            const name = promptStringWithAlert(
              "Edit project name",
              NonEmptyTrimmedString100,
              project.name,
            );
            if (name.ok)
              update("project", { id: project.id, name: name.value });
          }}
        />
        <TextButton
          title="Delete"
          onClick={() => {
            if (!confirm(`Delete project "${project.name}"?`)) return;
            // Its todos stay as they are: queries leave out the todos of a
            // deleted project. Deleting each todo would sync a change per todo
            // and miss todos other devices haven't synced yet.
            update("project", { id: project.id, isDeleted: sqliteTrue });
          }}
        />
      </Card>
    </li>
  );
};

const deletedProjectsQuery = createQuery((db) =>
  db
    .selectFrom("project")
    .select(["id", "name", "updatedAt"])
    .where("isDeleted", "is", sqliteTrue)
    .where("name", "is not", null)
    .$narrowType<{ name: KyselyNotNull }>()
    .orderBy("updatedAt", "desc"),
);

// Deleted todos with their project nested, the relation's other direction.
const deletedTodosQuery = createQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "updatedAt"])
    .select((eb) => [
      evoluJsonObjectFrom(
        eb
          .selectFrom("project")
          .select(["project.name"])
          .whereRef("project.id", "=", "todo.projectId")
          .where("project.isDeleted", "is not", sqliteTrue)
          .where("project.name", "is not", null)
          .$narrowType<{ name: KyselyNotNull }>(),
      ).as("project"),
    ])
    .where("isDeleted", "is", sqliteTrue)
    .where("title", "is not", null)
    .$narrowType<{ title: KyselyNotNull }>()
    .orderBy("updatedAt", "desc"),
);

const TrashTab: FC = () => {
  const [deletedProjects, deletedTodos] = useQueries([
    deletedProjectsQuery,
    deletedTodosQuery,
  ]);
  const { update } = useEvolu();

  if (deletedProjects.length === 0 && deletedTodos.length === 0)
    return (
      <div className="py-12 text-center">
        <h3 className="mb-2 text-lg font-medium text-gray-900">
          Trash is empty
        </h3>
        <p className="text-gray-500">
          Deleted projects and todos will appear here
        </p>
      </div>
    );

  return (
    <div className="space-y-6">
      {deletedProjects.length > 0 && (
        <TrashList title="Deleted Projects">
          {deletedProjects.map((project) => (
            <TrashItem
              key={project.id}
              title={project.name}
              detail={`Deleted ${formatDate(project.updatedAt)}`}
              onRestore={() => {
                update("project", { id: project.id, isDeleted: sqliteFalse });
              }}
            />
          ))}
        </TrashList>
      )}
      {deletedTodos.length > 0 && (
        <TrashList title="Deleted Todos">
          {deletedTodos.map((todo) => (
            <TrashItem
              key={todo.id}
              title={todo.title}
              detail={`${todo.project?.name ?? "Deleted project"} • Deleted ${formatDate(todo.updatedAt)}`}
              onRestore={() => {
                update("todo", { id: todo.id, isDeleted: sqliteFalse });
              }}
            />
          ))}
        </TrashList>
      )}
    </div>
  );
};

const TrashList: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <div>
    <h3 className="mb-3 text-lg font-semibold text-gray-900">{title}</h3>
    <ul aria-label={title} className="space-y-2">
      {children}
    </ul>
  </div>
);

const TrashItem: FC<{
  title: string;
  detail: string;
  onRestore: () => void;
}> = ({ title, detail, onRestore }) => (
  <li>
    <Card className="flex items-center gap-3">
      <div className="flex-1">
        <h4 className="font-medium text-gray-900">{title}</h4>
        <p className="text-sm text-gray-500">{detail}</p>
      </div>
      <TextButton title="Restore" onClick={onRestore} />
    </Card>
  </li>
);

/**
 * The AppOwners on this device, with the open one's mnemonic, the backup that
 * restores its synced data on another device or after this one loses it.
 */
const Accounts: FC = () => {
  const evolu = useEvolu();
  const { appOwner } = evolu;
  const [showMnemonic, setShowMnemonic] = useState(false);

  const handleDownloadClick = () => {
    void evolu
      .exportDatabase()
      .then((data) => {
        using objectUrl = createObjectURL(
          new Blob([data], { type: "application/x-sqlite3" }),
        );
        const link = document.createElement("a");
        link.href = objectUrl.url;
        link.download = `${evolu.name}.sqlite3`;
        link.click();
      })
      .catch((error: EvoluDisposedError | UnknownError) => {
        // A deletion or removal disposed the instance first.
        if (error.type === "EvoluDisposedError") return;
        alert("Downloading the database failed. Try again.");
      });
  };

  const handleDeleteClick = () => {
    if (
      !confirm(
        "Delete this account's database on this device? What synced comes back from the relays; changes that haven't synced yet are lost.",
      )
    )
      return;
    // Every tab that has the AppOwner open opens its database again, empty,
    // and the relay syncs back what it has.
    void evolu.deleteDatabase().then((deleted) => {
      // After a failure, such as a deletion another tab's open dialog delayed,
      // the instances keep working, and deleting again deletes again. Files
      // another context keeps holding also refuse the database, which
      // evoluError shows.
      if (
        !deleted.ok &&
        (deleted.error.type === "DatabaseHeldError" ||
          deleted.error.type === "UnknownError")
      )
        alert("Deleting the data failed. Try again.");
    });
  };

  return (
    <Section title="Accounts">
      <p className="mb-4 text-sm text-gray-600">
        Each account has its own data, encrypted with the account&apos;s secret,
        which its mnemonic restores on another device.
      </p>
      <AppOwnerList openId={appOwner.id} />
      <AddAppOwnerButtons>
        <Button
          title={`${showMnemonic ? "Hide" : "Show"} Mnemonic`}
          onClick={() => {
            setShowMnemonic(!showMnemonic);
          }}
        />
      </AddAppOwnerButtons>
      {showMnemonic && (
        <label className="mt-4 block bg-gray-50 p-3 text-xs font-medium text-gray-700">
          Mnemonic of the open account (keep it safe)
          <textarea
            value={appOwner.mnemonic}
            readOnly
            rows={3}
            className="mt-2 w-full bg-white px-2 py-1 font-mono text-xs"
          />
        </label>
      )}
      <Suspense>
        <DevicePersistenceAdvice />
      </Suspense>
      <p className="my-4 text-sm text-gray-600">
        The download is a plaintext copy of this account&apos;s database that
        any SQLite tool reads; Evolu can&apos;t restore it.
      </p>
      <Button title="Download Database" onClick={handleDownloadClick} />
      <p className="my-4 text-sm text-gray-600">
        You&apos;ll most likely never need this, but if this account&apos;s
        database on this device breaks, for example through faulty storage or a
        bug in the browser, Delete Database deletes it but keeps the account, so
        you don&apos;t need its mnemonic. What synced comes back from the
        relays, and only changes that haven&apos;t synced yet are lost.
      </p>
      <Button title="Delete Database" onClick={handleDeleteClick} />
    </Section>
  );
};

const AppOwnerList: FC<{ openId: OwnerId | null }> = ({ openId }) => {
  const app = useEvoluApp();
  // The one opened most recently first.
  const appOwners = useAppOwners();
  if (appOwners.length === 0) return null;

  return (
    <ul
      aria-label="Accounts on this device"
      className="mb-4 divide-y divide-gray-100"
    >
      {appOwners.map(({ id, name, lastOpenedAt }) => (
        <li key={id} className="flex items-center gap-2 py-2">
          <EvoluIdenticon id={id} size={32} />
          <div className="flex-1">
            <p className="text-sm text-gray-900">
              {name ?? "Unnamed account"}
              {id === openId && " (open)"}
            </p>
            {/* A start records no open time, as for the first AppOwner, so it shows no line until it's opened again, except while it's open. */}
            {(lastOpenedAt != null || id === openId) && (
              <p className="text-xs text-gray-500">
                {lastOpenedAt
                  ? `Last opened ${formatDate(lastOpenedAt)}`
                  : "Open now"}
              </p>
            )}
          </div>
          {id !== openId && (
            <TextButton
              title="Open"
              onClick={() => {
                app.open(id);
              }}
            />
          )}
          <TextButton
            title="Rename"
            onClick={() => {
              const newName = promptStringWithAlert(
                "Name this account",
                NonEmptyTrimmedString100,
                name ?? undefined,
              );
              if (newName.ok) app.rename(id, newName.value);
            }}
          />
          <TextButton
            title="Remove"
            onClick={() => {
              if (
                !confirm(
                  `Remove ${name ?? "this unnamed account"}? This removes it from this device and deletes its data here. Changes that haven't synced are lost. Synced data comes back when you restore the mnemonic.`,
                )
              )
                return;
              void app.remove(id).then((removed) => {
                // The app's disposal ends the call, and the removal finishes.
                // A refused device database shows as evoluError. A removal
                // that failed, such as of a database another context holds,
                // finishes when it runs again.
                if (
                  !removed.ok &&
                  (removed.error.type === "DatabaseHeldError" ||
                    removed.error.type === "UnknownError")
                )
                  alert("Removing the account failed. Try again.");
              });
            }}
          />
        </li>
      ))}
    </ul>
  );
};

// With an account open, the row also holds that account's buttons.
const AddAppOwnerButtons: FC<{ children?: ReactNode }> = ({ children }) => {
  const app = useEvoluApp();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        title="Create Account"
        variant="primary"
        onClick={() => {
          void addAppOwner(app, createOwnerSecret(run.deps));
        }}
      />
      <Button
        title="Restore Account"
        onClick={() => {
          void restoreAppOwner(app);
        }}
      />
      {children}
    </div>
  );
};

/**
 * Adds an AppOwner under the name the user confirms, which opens it once
 * stored, or nothing when the user cancels. Adding it again is safe, and the
 * name prefilled for an AppOwner already on this device is its own, because the
 * name the user confirms replaces it.
 */
export const addAppOwner = async (
  app: App,
  secret: OwnerSecret,
): Promise<void> => {
  const appOwners = app.appOwners.get();
  const { id } = createAppOwner(secret);
  // "Account N" with the next number no AppOwner's name has: a default the
  // user can change, so accounts stay distinguishable when the user only
  // confirms it.
  const names = new Set<string | null>(
    appOwners.map((appOwner) => appOwner.name),
  );
  let number = appOwners.length + 1;
  while (names.has(`Account ${number}`)) number++;
  const name = promptStringWithAlert(
    "Name this account",
    NonEmptyTrimmedString100,
    appOwners.find((appOwner) => appOwner.id === id)?.name ??
      `Account ${number}`,
  );
  if (!name.ok) return;
  const added = await app.add(secret, name.value);
  if (!added.ok && added.error.type === "UnknownError")
    alert("Adding the account failed. Try again.");
};

/**
 * Restores an AppOwner from its mnemonic, which opens it and syncs its data
 * from the relay, or resolves to nothing when the user cancels.
 */
export const restoreAppOwner = async (app: App): Promise<void> => {
  const mnemonic = promptStringWithAlert(
    "Enter your mnemonic to restore your data:",
    {
      // Mnemonic accepts one spelling only, NFKD with single spaces, as
      // its JSDoc says.
      fromUnknown: (value) =>
        Mnemonic.fromUnknown(
          value.normalize("NFKD").trim().split(/\s+/u).join(" "),
        ),
      formatError: Mnemonic.formatError,
    },
  );
  if (mnemonic.ok)
    await addAppOwner(app, mnemonicToOwnerSecret(mnemonic.value));
};

/**
 * Where the browser keeps the data but may delete it, the mnemonic is what
 * brings synced data back. `NotPersisted` has its notice above the data.
 */
const DevicePersistenceAdvice: FC = () => {
  const devicePersistence = use(useEvolu().devicePersistence);
  if (devicePersistence !== "Unknown") return null;
  return (
    <p className="mt-4 text-sm text-gray-600">
      This browser stores your data, but it may delete it, such as when disk
      space runs low. Keep your mnemonic: it restores what has synced.
    </p>
  );
};

/**
 * The open AppOwner's relays, each with its connection and how far this
 * database is synced through it, as an app that shows a sync indicator does;
 * see `OwnerSyncStatus`. The quiet status line above the app tells the user
 * only what needs attention. A relay the user adds syncs the AppOwner too,
 * while this account stays open on this page, as a backup in another place.
 */
const Relays: FC = () => {
  const { name, appOwner } = useEvolu();
  const [addedRelayUrls, setAddedRelayUrls] = useState<ReadonlyArray<RelayUrl>>(
    [],
  );
  const [newRelayUrl, setNewRelayUrl] = useState("");
  const [relayUrlError, setRelayUrlError] = useState<string | null>(null);
  // The whole snapshot, so it renders on every change, which suits a detail
  // view. For one status, `useOwnerSyncStatus` renders only when it changes.
  const syncState = useSyncExternalStore(
    run.deps.syncState.subscribe,
    run.deps.syncState.get,
    constNull,
  );
  const tenant = syncState?.tenants.find((tenant) => tenant.name === name);
  const status = syncStateToOwnerSyncStatus(syncState, name, appOwner.id);
  const relays = syncStateToRelaySyncStates(syncState, name, appOwner.id);
  // Times that stay true while the status lasts: since when the AppOwner is
  // up to date, or disconnected.
  const upToDateSince = newestMillis(
    relays.map(({ route }) =>
      route.type === "Complete" ? route.completeAt : null,
    ),
  );
  const disconnectedSince = newestMillis(
    relays.map(({ transport: { connection } }) =>
      connection.type === "Disconnected" ? connection.disconnectedAt : null,
    ),
  );
  const reportedUrls = new Set(relays.map(({ transport }) => transport.label));
  // Listed until the shared worker reports them, so an added relay can always
  // be removed.
  const pendingUrls = [configRelayUrl, ...addedRelayUrls].filter(
    (url) => !reportedUrls.has(url),
  );
  const relayCount = relays.length + pendingUrls.length;
  const relaysNoun = relayCount === 1 ? "relay" : "relays";
  const connectedCount = relays.filter(
    ({ transport }) => transport.connection.type === "Open",
  ).length;
  const completeCount = relays.filter(
    ({ route }) => route.type === "Complete",
  ).length;

  const addRelay = () => {
    const url = RelayUrlFromString.fromUnknown(newRelayUrl.trim());
    if (!url.ok) {
      setRelayUrlError(
        "Use a ws:// or wss:// relay URL with a valid host name and path, without credentials, a query, or a fragment.",
      );
      return;
    }
    // Browsers block ws:// from an HTTPS page, except to this device.
    const { protocol, hostname } = new URL(url.value);
    const isLoopback =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "[::1]" ||
      /^127(\.\d{1,3}){3}$/u.test(hostname);
    if (
      window.location.protocol === "https:" &&
      protocol !== "wss:" &&
      !isLoopback
    ) {
      setRelayUrlError(
        "Use wss:// when this page is opened over HTTPS, except for a relay on this device.",
      );
      return;
    }
    // A canonical URL makes equivalent spellings one relay.
    if (
      url.value === configRelayUrl ||
      addedRelayUrls.includes(url.value) ||
      reportedUrls.has(url.value)
    ) {
      setRelayUrlError("This relay is already added.");
      return;
    }
    setAddedRelayUrls((urls) => [...urls, url.value]);
    setNewRelayUrl("");
    setRelayUrlError(null);
  };

  const relayOrigin = (url: RelayUrl) =>
    url === configRelayUrl ? (
      <p className="mt-2 text-xs text-gray-500">From the app&apos;s config.</p>
    ) : addedRelayUrls.includes(url) ? (
      <button
        type="button"
        aria-label={`Remove ${url}`}
        onClick={() => {
          setAddedRelayUrls((urls) => urls.filter((added) => added !== url));
        }}
        className="mt-2 text-xs text-gray-500 hover:text-red-700"
      >
        Remove
      </button>
    ) : (
      <p className="mt-2 text-xs text-gray-500">Added in another tab.</p>
    );

  return (
    <Section title="Relays">
      {addedRelayUrls.map((url) => (
        <RelayRegistration key={url} url={url} />
      ))}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-900">Sync</p>
        {tenant?.type === "Refused" ? (
          <StatusBadge tone="error">Database unavailable</StatusBadge>
        ) : (
          <StatusBadge tone={displayBySyncStatus[status.type].tone}>
            {displayBySyncStatus[status.type].label}
          </StatusBadge>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-600">
        {tenant?.type === "Refused"
          ? `This database could not start: ${tenant.error.type}.`
          : displayBySyncStatus[status.type].description}
      </p>
      <div className="mt-3 rounded-md bg-gray-50 p-3 text-sm">
        <p>
          {connectedCount} of {relayCount} {relaysNoun} connected
        </p>
        <p>
          {completeCount} of {relayCount} {relaysNoun} up to date
        </p>
        {status.type === "Synced" && (
          <p className="mt-1 text-xs text-gray-500">
            Up to date since <Timestamp value={upToDateSince} />
          </p>
        )}
        {status.type === "Disconnected" && (
          <p className="mt-1 text-xs text-gray-500">
            Disconnected since <Timestamp value={disconnectedSince} />
          </p>
        )}
      </div>

      <ul aria-label="Relays" className="mt-3 divide-y divide-gray-100">
        {relays.map((relay) => {
          const {
            transport: { label, connection },
            route,
          } = relay;
          return (
            <li key={relay.transport.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs break-all text-gray-500">{label}</span>
                <StatusBadge
                  tone={connection.type === "Open" ? "success" : "neutral"}
                >
                  {connectionLabels[connection.type]}
                </StatusBadge>
              </div>
              <p className="text-sm text-gray-900">
                {relaySyncStateToMessage(relay)}
              </p>
              <details className="mt-1 text-xs text-gray-500">
                <summary className="cursor-pointer">
                  Connection and sync details
                </summary>
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                  {connection.type === "Open" && (
                    <>
                      <dt>Connected since</dt>
                      <dd>
                        <Timestamp value={connection.openedAt} />
                      </dd>
                    </>
                  )}
                  {connection.type === "Disconnected" && (
                    <>
                      <dt>Disconnected since</dt>
                      <dd>
                        <Timestamp value={connection.disconnectedAt} />
                      </dd>
                      <dt>Last connected</dt>
                      <dd>
                        <Timestamp value={connection.openedAt} />
                      </dd>
                    </>
                  )}
                  <dt>Last request</dt>
                  <dd>
                    <Timestamp value={route.lastSentAt} />
                  </dd>
                  <dt>Last processed message</dt>
                  <dd>
                    <Timestamp value={route.lastReceivedAt} />
                  </dd>
                </dl>
                {/* Kept after reconnecting, so a flaky relay shows. */}
                {connection.type !== "Connecting" && connection.error && (
                  <p className="mt-2 wrap-break-word">
                    Last connection error: {connection.error.type} at{" "}
                    <Timestamp value={connection.error.at} />.
                  </p>
                )}
              </details>
              {relayOrigin(label)}
            </li>
          );
        })}
        {pendingUrls.map((url) => (
          <li key={url} className="py-2">
            <span className="text-xs break-all text-gray-500">{url}</span>
            <p className="text-sm text-gray-900">Waiting for relay state…</p>
            {relayOrigin(url)}
          </li>
        ))}
      </ul>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          addRelay();
        }}
      >
        <label htmlFor="relay-url" className="text-sm font-medium">
          Relay URL
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="relay-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            value={newRelayUrl}
            onChange={(e) => {
              setNewRelayUrl(e.target.value);
            }}
            placeholder="wss://your-backup-relay.example"
            aria-invalid={relayUrlError !== null}
            aria-describedby={relayUrlError ? "relay-url-error" : undefined}
            className={inputClassName}
          />
          <Button title="Add Relay" onClick={addRelay} />
        </div>
        {relayUrlError && (
          <p
            id="relay-url-error"
            role="alert"
            className="mt-2 text-sm text-red-700"
          >
            {relayUrlError}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          Keep syncing when a relay goes down: add an independent backup relay,
          stop one, and the other keeps syncing; the stopped one catches up once
          it&apos;s back. Added relays last while this account stays open on
          this page, and removing one releases only this page&apos;s connection.{" "}
          <a href="/docs/relay" className="underline">
            Read about relay redundancy
          </a>
          .
        </p>
      </form>
    </Section>
  );
};

// Each keyed component owns one registration, so adding or removing a relay
// leaves the others connected.
const RelayRegistration: FC<{ url: RelayUrl }> = ({ url }) => {
  const { appOwner } = useEvolu();
  useOwner(appOwner, [
    createOwnerWebSocketTransport({ url, ownerId: appOwner.id }),
  ]);
  return null;
};

const displayBySyncStatus: Readonly<
  Record<
    OwnerSyncStatus["type"],
    {
      readonly label: string;
      readonly description: string;
      readonly tone: "success" | "progress" | "neutral" | "error";
    }
  >
> = {
  NoRelays: {
    label: "Starting",
    description: "Setting up its relays.",
    tone: "progress",
  },
  Syncing: {
    label: "Syncing",
    description:
      "Connecting to its relays or reconciling this database with them.",
    tone: "progress",
  },
  Synced: {
    label: "Synced",
    description: "Up to date with the connected relays.",
    tone: "success",
  },
  Disconnected: {
    label: "Disconnected",
    description: "No relay is connected. You can keep editing on this device.",
    tone: "neutral",
  },
  Error: {
    label: "Sync error",
    description:
      "A relay failed or holds a change this database cannot read. See the relays below.",
    tone: "error",
  },
};

const connectionLabels: Readonly<Record<SyncConnection["type"], string>> = {
  Connecting: "Connecting",
  Open: "Connected",
  Disconnected: "Disconnected",
};

const newestMillis = (values: ReadonlyArray<Millis | null>): Millis | null =>
  values.reduce<Millis | null>(
    (newest, value) =>
      value !== null && (newest === null || value > newest) ? value : newest,
    null,
  );

const StatusBadge: FC<{
  tone: "success" | "progress" | "neutral" | "error";
  children: ReactNode;
}> = ({ tone, children }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
      {
        success: "bg-green-50 text-green-800",
        progress: "bg-blue-50 text-blue-800",
        neutral: "bg-gray-100 text-gray-600",
        error: "bg-red-50 text-red-800",
      }[tone]
    }`}
  >
    {children}
  </span>
);

const Timestamp: FC<{ value: Millis | null }> = ({ value }) =>
  value === null ? (
    <>Not yet</>
  ) : (
    <time
      dateTime={new Date(value).toISOString()}
      title={new Date(value).toLocaleString()}
    >
      {formatTime(value)}
    </time>
  );

const relaySyncStateToMessage = (relay: RelaySyncState): string => {
  const { connection } = relay.transport;
  const status = relaySyncStateToStatus(relay);
  switch (status.type) {
    // A time that stays true while the status lasts, as `OwnerSyncStatus`
    // recommends, rather than when the last message arrived.
    case "Synced":
      return relay.route.type === "Complete"
        ? `Up to date since ${formatTime(relay.route.completeAt)}`
        : "Up to date";
    case "Syncing":
      return connection.type === "Connecting" ? "Connecting…" : "Syncing…";
    case "Disconnected":
      return connection.type === "Disconnected"
        ? `Disconnected since ${formatTime(connection.disconnectedAt)}`
        : "Disconnected";
    case "Error":
      return `Sync error: ${status.error.type}`;
  }
};

const formatDate = (date: string | null): string =>
  date ? new Date(date).toLocaleString() : "";

const formatTime = (millis: number): string =>
  new Date(millis).toLocaleTimeString();

const Section: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <section aria-label={title} className="mb-8">
    <h2 className="mb-4 text-lg font-medium text-gray-900">{title}</h2>
    <Card>{children}</Card>
  </section>
);

const Card: FC<{ className?: string; children: ReactNode }> = ({
  className = "",
  children,
}) => (
  <div
    className={`rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200 ${className}`}
  >
    {children}
  </div>
);

export const Button: FC<{
  title: string;
  className?: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}> = ({ title, className = "", onClick, variant = "secondary" }) => (
  // Not a submit button, so a form's Enter runs only the form's handler.
  <button
    type="button"
    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      variant === "primary"
        ? "bg-blue-600 text-white hover:bg-blue-700"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    } ${className}`}
    onClick={onClick}
  >
    {title}
  </button>
);

const TextButton: FC<{ title: string; onClick: () => void }> = ({
  title,
  onClick,
}) => (
  <button
    type="button"
    className="px-1 text-xs text-gray-500 hover:text-blue-600"
    onClick={onClick}
  >
    {title}
  </button>
);

const inputClassName =
  "block w-full rounded-md bg-white px-3 py-1.5 text-sm text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600";

interface StringType<Output, Error extends TypeError> {
  readonly fromUnknown: (value: string) => Result<Output, Error>;
  readonly formatError: (error: Error) => string;
}

interface PromptCancelledError extends Typed<"PromptCancelledError"> {}

const promptStringWithAlert = <Output, Error extends TypeError>(
  message: string,
  type: StringType<Output, Error>,
  initialValue?: string,
): Result<Output, Error | PromptCancelledError> => {
  const value = window.prompt(message, initialValue);
  if (value == null) return err({ type: "PromptCancelledError" });
  return parseStringWithAlert(type, value);
};

const parseStringWithAlert = <Output, Error extends TypeError>(
  type: StringType<Output, Error>,
  value: string,
): Result<Output, Error> => {
  const parsed = type.fromUnknown(value.trim());
  if (!parsed.ok) alert(type.formatError(parsed.error));
  return parsed;
};
