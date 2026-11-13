"use client";

import {
  AppName,
  booleanToSqliteBoolean,
  constNull,
  createConsole,
  createConsoleFormatter,
  createEvoluApp,
  createObjectURL,
  createAppOwner,
  createOwnerSecret,
  createQueryBuilder,
  err,
  evoluJsonArrayFrom,
  id,
  Mnemonic,
  mnemonicToOwnerSecret,
  NonEmptyTrimmedString100,
  nullOr,
  SqliteBoolean,
  sqliteTrue,
  WebSocketUrl,
  type EvoluApp,
  type EvoluDisposedError,
  type EvoluError,
  type KyselyNotNull,
  type OwnerId,
  type OwnerSecret,
  type Result,
  type TypeError,
  type Typed,
  type UnknownError,
} from "@evolu/common";
import {
  relaySyncStateToStatus,
  syncStateToRelaySyncStates,
  type RelaySyncState,
} from "@evolu/common/local-first";
import { createEvoluBinding } from "@evolu/react";
import { createEvoluDeps, EvoluIdenticon } from "@evolu/react-web";
import { createRun } from "@evolu/web";
import {
  Component,
  Suspense,
  use,
  useState,
  useSyncExternalStore,
  type FC,
  type ReactNode,
} from "react";

// A full Evolu app: projects with their todos, the AppOwners on this device,
// sync, and what the device keeps, as examples/README.md lists.

const ProjectId = id("Project");
type ProjectId = typeof ProjectId.Output;

const TodoId = id("Todo");

const Schema = {
  project: {
    id: ProjectId,
    name: NonEmptyTrimmedString100,
  },
  todo: {
    id: TodoId,
    title: NonEmptyTrimmedString100,
    isCompleted: nullOr(SqliteBoolean),
    projectId: ProjectId,
  },
};

const createQuery = createQueryBuilder(Schema);

const run = createRun(
  createEvoluDeps({
    console: createConsole({
      // Debug entries include OwnerIds, which are secret to all but their
      // relays, so only development logs them.
      level: process.env.NODE_ENV === "development" ? "debug" : "log",
      formatter: createConsoleFormatter()({ timestampFormat: "relative" }),
    }),
  }),
);

const {
  EvoluAppProvider,
  useAppOwners,
  useEvolu,
  useEvoluApp,
  useOwnerSyncStatus,
  useQueries,
} = createEvoluBinding<typeof Schema>();

type App = EvoluApp<typeof Schema>;

// Instant start needs no prompt, but the key of the device database, which
// keeps the AppOwners' secrets, is public: anything that can read this
// browser's storage can read them. An app with sensitive data unlocks the
// device database with a passkey instead, as examples/react-vite-pwa shows;
// that logic runs before createEvoluApp and is the same in every framework.
const appPromise = run.orThrow(
  createEvoluApp(Schema, {
    appName: AppName.orThrow("react-nextjs"),
    auth: { type: "InstantStart" },
    // The app starts with an AppOwner, which the user can remove from the
    // list, so the first start shows the app right away.
    createFirstAppOwner: true,

    // Omitted, Evolu syncs with its free relay, which is for testing.
    // `transports: []` keeps everything on this device. Sync can be added
    // later with `evolu.useOwner(evolu.appOwner, transports)`, which syncs
    // the data made before.
    ...(process.env.NODE_ENV === "development" && {
      transports: [
        {
          type: "WebSocket",
          url: WebSocketUrl.orThrow("ws://localhost:4000/"),
        },
      ],
    }),

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
export const EvoluFullExample: FC = () => {
  // Shared by all Evolu instances created from these deps.
  const error = useSyncExternalStore(
    run.deps.evoluError.subscribe,
    run.deps.evoluError.get,
    constNull,
  );

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 border-l-2 border-amber-400 pl-4 text-sm text-gray-600">
          <p>
            This app needs no passkey, so its data on this device isn&apos;t
            protected against malware, and it doesn&apos;t suit sensitive data.
          </p>
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
            <AppView app={appPromise} />
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
 * failed start, such as a refused database; the account's data has a boundary
 * of its own, so a failing query never reaches it. React has no hook for an
 * error boundary, so it's a class.
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
 * The app once it started. The projects load under a Suspense boundary inside
 * an error boundary, with the accounts and relays sections outside both. A
 * query SQLite fails throws, such as on a corrupt page, and a refused database
 * keeps its queries pending; either way, the user can still open, add, or
 * remove an account, or delete this one's local data. Opening another AppOwner
 * remounts these children, which resets the error boundary. Opening this one
 * again reuses its instance, whose failed query fails again until a mutation or
 * sync refreshes it, while deleting its local data opens a new instance.
 */
const AppView: FC<{ app: Promise<App> }> = ({ app }) => (
  <EvoluAppProvider value={app} withoutAppOwner={<WithoutAppOwner />}>
    <SyncStatus />
    <ErrorBoundary
      fallback={
        <p role="alert" className="mb-8 text-sm text-red-800">
          This account&apos;s data couldn&apos;t load. See the console for
          details. You can still open another account, remove this one, or
          delete its database.
        </p>
      }
    >
      <Suspense fallback={<p className="text-sm text-gray-600">Loading…</p>}>
        <DevicePersistenceNotice />
        <Projects />
      </Suspense>
    </ErrorBoundary>
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

// Projects with their todos nested, one query for the whole section. Evolu
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
            .select(["todo.id", "todo.title", "todo.isCompleted"])
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
    .select(["id", "name"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("name", "is not", null)
    .$narrowType<{ name: KyselyNotNull }>()
    .orderBy("createdAt"),
);

type ProjectsRow = typeof projectsQuery.Row;

/**
 * The open AppOwner's projects, each with its todos, which can be added,
 * edited, moved to another project, and deleted.
 */
const Projects: FC = () => {
  const [projectsWithTodos, projects] = useQueries([
    projectsWithTodosQuery,
    // The projects for moving a todo. Separate queries are cheap in
    // local-first, and this one changes less often than the todos.
    projectsQuery,
  ]);
  const { insert } = useEvolu();

  return (
    <section aria-label="Projects" className="mb-8">
      <h2 className="mb-4 text-lg font-medium text-gray-900">Projects</h2>
      {projectsWithTodos.length === 0 ? (
        <p className="mb-4 text-sm text-gray-600">No projects yet</p>
      ) : (
        <div className="mb-4 flex flex-col gap-4">
          {projectsWithTodos.map((project) => (
            <ProjectTodos
              key={project.id}
              project={project}
              projects={projects}
            />
          ))}
        </div>
      )}
      <Button
        title="Add Project"
        onClick={() => {
          const name = promptStringWithAlert(
            "What's the project name?",
            NonEmptyTrimmedString100,
          );
          if (name.ok) insert("project", { name: name.value });
        }}
        variant="primary"
        className="w-full"
      />
    </section>
  );
};

const ProjectTodos: FC<{
  project: ProjectsWithTodosRow;
  projects: ReadonlyArray<ProjectsRow>;
}> = ({ project, projects }) => {
  const { insert, update } = useEvolu();
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
      <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
        <h3 className="flex-1 font-medium text-gray-900">{project.name}</h3>
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
            //
            // `isDeleted` keeps the row, so restoring it is an update with
            // `sqliteFalse`; the full playground's Trash shows it.
            update("project", { id: project.id, isDeleted: sqliteTrue });
          }}
        />
      </div>
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
}> = ({ todo: { id, title, isCompleted }, projectId, projects }) => {
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
const addAppOwner = async (app: App, secret: OwnerSecret): Promise<void> => {
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
const restoreAppOwner = async (app: App): Promise<void> => {
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
 * database is synced through it. The quiet status line above the app tells the
 * user only what needs attention; this is the detail behind it.
 */
const Relays: FC = () => {
  const { name, appOwner } = useEvolu();
  // The whole snapshot, so it renders on every change, which suits a detail
  // view. For one status, `useOwnerSyncStatus` renders only when it changes.
  const syncState = useSyncExternalStore(
    run.deps.syncState.subscribe,
    run.deps.syncState.get,
    constNull,
  );
  const relays = syncStateToRelaySyncStates(syncState, name, appOwner.id);

  return (
    <Section title="Relays">
      {relays.length === 0 ? (
        <p className="text-sm text-gray-600">No relay syncs this account.</p>
      ) : (
        <ul aria-label="Relays" className="divide-y divide-gray-100">
          {relays.map((relay) => (
            <li key={relay.transport.id} className="py-2">
              <p className="text-xs break-all text-gray-500">
                {relay.transport.label}
              </p>
              <p className="text-sm text-gray-900">
                {relaySyncStateToMessage(relay)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};

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

const formatDate = (date: string): string => new Date(date).toLocaleString();

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

const Card: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200">
    {children}
  </div>
);

const Button: FC<{
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
