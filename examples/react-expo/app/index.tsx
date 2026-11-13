import Alert from "@blazejkustra/react-native-alert";
import {
  AppName,
  booleanToSqliteBoolean,
  constNull,
  createConsole,
  createConsoleFormatter,
  createEvoluApp,
  createAppOwner,
  createOwnerSecret,
  createQueryBuilder,
  evoluJsonArrayFrom,
  id,
  Mnemonic,
  mnemonicToOwnerSecret,
  NonEmptyTrimmedString100,
  nullOr,
  ok,
  SqliteBoolean,
  sqliteTrue,
  WebSocketUrl,
  type DeviceSecret,
  type EvoluApp,
  type EvoluError,
  type KyselyNotNull,
  type OwnerId,
  type OwnerSecret,
  type Result,
  type TypeError,
  type UnknownError,
} from "@evolu/common";
import {
  relaySyncStateToStatus,
  syncStateToRelaySyncStates,
  type RelaySyncState,
} from "@evolu/common/local-first";
import { createEvoluBinding } from "@evolu/react";
import {
  createEvoluDeps,
  createRun,
  forgetDeviceSecret,
  loadDeviceSecret,
  type LoadDeviceSecretError,
} from "@evolu/react-native";
// Its own entry point, because it needs react-native-svg, an optional peer.
import { EvoluIdenticon } from "@evolu/react-native/identicon";
import {
  Component,
  Suspense,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
  type FC,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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

const deps = createEvoluDeps({
  console: createConsole({
    // Debug entries include OwnerIds, which are secret to all but their relays,
    // so only development logs them.
    level: __DEV__ ? "debug" : "log",
    formatter: createConsoleFormatter()({ timestampFormat: "relative" }),
  }),
});

const run = createRun(deps);

const {
  EvoluAppProvider,
  useAppOwners,
  useEvolu,
  useEvoluApp,
  useOwnerSyncStatus,
  useQuery,
  useQueries,
} = createEvoluBinding<typeof Schema>();

type App = EvoluApp<typeof Schema>;

const appName = AppName.orThrow("react-expo");

/**
 * Evolu creates the app's AppOwners, keeps them on this device, and opens the
 * one opened last. The device database, which keeps them, is encrypted with a
 * DeviceSecret that the iOS Keychain or the Android Keystore keeps. React
 * Native needs no instant start, because its secure storage needs no prompt.
 * The first start offers to create or restore an AppOwner, so the device
 * database creates none of its own.
 */
const createApp = (secret: DeviceSecret): Promise<App> =>
  run.orThrow(
    createEvoluApp(Schema, {
      appName,
      auth: { type: "DeviceSecret", secret },
      createFirstAppOwner: false,

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

// Loads the DeviceSecret, whose failure the app shows with a way to recover,
// then creates the app with it. It starts in a render, not at module scope,
// so the device test route, which loads this module too, starts no app.
//
// Index stays mounted while the app runs, so only a restart disposes the app.
// A Fast Refresh remount in development leaves the old one open.
const startApp = () =>
  run(loadDeviceSecret(appName)).then((secret) =>
    secret.ok ? ok(createApp(secret.value)) : secret,
  );

type AppStart = ReturnType<typeof startApp>;

/**
 * The app's start: starting, with its attempt, which numbers the app's instance
 * and resets the error boundary, and whether the start it replaced failed to
 * load the DeviceSecret; or restarting, which unmounts the app before disposing
 * it, so no tap reaches an instance being disposed, and whether a failed load
 * of the DeviceSecret then counts as a failed retry, which it doesn't after a
 * start over.
 */
type StartState =
  | {
      readonly type: "Starting";
      readonly appStart: AppStart;
      readonly attempt: number;
      readonly previousLoadFailed: boolean;
    }
  | {
      readonly type: "Restarting";
      readonly previous: AppStart;
      readonly attempt: number;
      readonly countsAsRetry: boolean;
    };

const Index: FC = () => {
  const [state, setState] = useState<StartState>(() => ({
    type: "Starting",
    appStart: startApp(),
    attempt: 1,
    previousLoadFailed: false,
  }));
  // Shared by all Evolu instances created from these deps.
  const error = useSyncExternalStore(
    deps.evoluError.subscribe,
    deps.evoluError.get,
    constNull,
  );

  // Disposes the previous app once the restart unmounted it, then starts again.
  useEffect(() => {
    if (state.type !== "Restarting") return;
    const { previous, attempt, countsAsRetry } = state;
    void previous.then(async (started) => {
      // An app whose DeviceSecret failed to load, or which failed to start,
      // leaves nothing to dispose.
      if (started.ok) {
        const app = await started.value.catch(() => null);
        await app?.[Symbol.asyncDispose]();
      }
      setState({
        type: "Starting",
        appStart: startApp(),
        attempt: attempt + 1,
        // Storage that can't be read yet says nothing about the DeviceSecret,
        // so it doesn't count as a failed retry.
        previousLoadFailed:
          countsAsRetry &&
          !started.ok &&
          started.error.type !== "DeviceSecretStorageUnavailable",
      });
    });
  }, [state]);

  // Starts again, such as after the DeviceSecret failed to load or a render
  // error reached the boundary. The device section offers it too, to check
  // that disposing the app and creating it again opens the same AppOwner with
  // its data. A restart in progress ignores another tap. A restart after a
  // start over isn't a retry, so a failed load of the new DeviceSecret doesn't
  // offer to start over at once.
  const restart = ({ countsAsRetry }: { countsAsRetry: boolean }) => {
    setState((current) =>
      current.type === "Starting"
        ? {
            type: "Restarting",
            previous: current.appStart,
            attempt: current.attempt,
            countsAsRetry,
          }
        : current,
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        keyboardDismissMode="interactive"
        // A tap on a button while the keyboard is open presses it, rather than
        // only dismissing the keyboard.
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.maxWidthContainer}>
          {/* Outside the Suspense boundary, so it shows when the app fails
              to start too. */}
          {error && (
            <Text accessibilityRole="alert" style={styles.errorBanner}>
              {evoluErrorToMessage(error)}
            </Text>
          )}
          {state.type === "Restarting" ? (
            <Loading />
          ) : (
            // A failed start, such as of a refused database, shows here
            // instead of unmounting the app. The key starts it over too.
            <ErrorBoundary
              key={state.attempt}
              fallback={
                <View style={styles.card}>
                  <Text style={styles.message}>
                    The app couldn&apos;t start. Check the console for details.
                  </Text>
                  <Button
                    title="Try Again"
                    onPress={() => {
                      restart({ countsAsRetry: true });
                    }}
                    variant="primary"
                  />
                </View>
              }
            >
              <Suspense fallback={<Loading />}>
                <AppView
                  appStart={state.appStart}
                  attempt={state.attempt}
                  previousLoadFailed={state.previousLoadFailed}
                  onRestart={() => {
                    restart({ countsAsRetry: true });
                  }}
                  onStartedOver={() => {
                    restart({ countsAsRetry: false });
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Index;

/** What the user can do about an `evoluError`; see `EvoluError`. */
const evoluErrorToMessage = (error: EvoluError): string => {
  switch (error.type) {
    case "OtherBuildRunningError":
      return "Another version of this app is running. Close it to continue.";
    case "UnsupportedDbVersionError":
      return "Your data needs a newer version of this app. Update it.";
    case "DatabaseHeldError":
      return "Something else holds your data. Restart the app.";
    case "UnknownError":
      return "Something went wrong. Restart the app. Check the console for details.";
  }
};

const Loading: FC = () => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>Opening…</Text>
  </View>
);

/**
 * The app once it started. The data loads under a Suspense boundary and an
 * error boundary of its own, with the accounts, relays, and device sections
 * outside both: a refused database keeps its queries pending, and a query
 * SQLite fails throws, such as on a corrupt page, and either way the user can
 * still open, add, or remove an account, or delete this one's local data.
 * Opening another AppOwner remounts these children, which resets the error
 * boundary. Opening this one again reuses its instance, whose failed query
 * fails again until a mutation or sync refreshes it, while deleting its local
 * data opens a new instance.
 */
const AppView: FC<{
  appStart: AppStart;
  attempt: number;
  previousLoadFailed: boolean;
  onRestart: () => void;
  onStartedOver: () => void;
}> = ({ appStart, attempt, previousLoadFailed, onRestart, onStartedOver }) => {
  const started = use(appStart);
  if (!started.ok)
    return (
      <DeviceSecretRecovery
        error={started.error}
        retried={previousLoadFailed}
        onRetry={onRestart}
        onStartedOver={onStartedOver}
      />
    );

  return (
    <EvoluAppProvider
      value={started.value}
      withoutAppOwner={<WithoutAppOwner />}
    >
      <SyncStatus />
      <ErrorBoundary
        fallback={
          <Text accessibilityRole="alert" style={styles.errorBanner}>
            This account&apos;s data couldn&apos;t load. Check the console for
            details. You can still open another account, remove this one, or
            delete its database.
          </Text>
        }
      >
        <Suspense fallback={<Loading />}>
          <Projects />
        </Suspense>
      </ErrorBoundary>
      <Accounts />
      <Relays />
      <Device instance={attempt} onRestart={onRestart} />
    </EvoluAppProvider>
  );
};

/**
 * Shown when the DeviceSecret, which opens the accounts on this device, failed
 * to load. Trying again is enough when the storage can't be read yet. A stored
 * DeviceSecret Android can't read may be lost for good, and so may a Keystore
 * key broken in a way Android doesn't report, which loads with an UnknownError
 * that lasts after a restart of the device. So on Android, once a retry failed
 * too, the user can start over, which loses the accounts on this device that
 * only their mnemonics bring back. iOS reads a Keychain item it can't decrypt
 * as missing, so its UnknownError is never one that starting over fixes; see
 * `loadDeviceSecret`.
 */
const DeviceSecretRecovery: FC<{
  error: LoadDeviceSecretError;
  retried: boolean;
  onRetry: () => void;
  onStartedOver: () => void;
}> = ({ error, retried, onRetry, onStartedOver }) => {
  const canStartOver =
    retried &&
    (error.type === "DeviceSecretUnreadable" ||
      (error.type === "UnknownError" && Platform.OS === "android"));
  const message =
    error.type === "DeviceSecretStorageUnavailable"
      ? "This device's secure storage can't be read yet, as before the first unlock after a restart. Unlock the device and try again."
      : error.type === "DeviceSecretUnreadable"
        ? "This device can't read the key that opens your accounts. Try again, and if that keeps failing, start over."
        : !retried
          ? "Loading the key that opens your accounts failed. Try again."
          : Platform.OS === "android"
            ? "Loading the key that opens your accounts still fails. Restart the device and try again, and if it fails after that too, start over."
            : "Loading the key that opens your accounts still fails. Restart the device and try again.";

  const handleStartOverPress = () => {
    Alert.alert(
      "Start over?",
      error.type === "UnknownError"
        ? "Only if restarting the device didn't help. Your accounts on this device come back only from their mnemonics."
        : "Your accounts on this device come back only from their mnemonics.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start over",
          style: "destructive",
          onPress: () => {
            void run(forgetDeviceSecret(appName)).then((forgotten) => {
              if (forgotten.ok) onStartedOver();
              else Alert.alert("Starting over failed", "Try again.");
            });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.row}>
        <Button
          title="Try Again"
          onPress={onRetry}
          variant="primary"
          style={styles.flex}
        />
        {canStartOver && (
          <Button
            title="Start Over"
            onPress={handleStartOverPress}
            style={styles.flex}
          />
        )}
      </View>
    </View>
  );
};

/**
 * Renders `fallback` instead of its children once one of them throws, which
 * React logs, rather than unmounting the app. The app's boundary shows a failed
 * start, such as a refused database; the data has a boundary of its own, so a
 * failing query never reaches it. React has no hook for an error boundary, so
 * it's a class.
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
 * Shown while the app has no AppOwner open: at the first start, which offers to
 * create or restore one, and after the open one's removal.
 */
const WithoutAppOwner: FC = () => (
  <Section title="Accounts">
    <Text style={styles.description}>No account is open on this device.</Text>
    <AppOwnerList openId={null} />
    <AddAppOwnerButtons />
  </Section>
);

/**
 * Tells the user when changes can't leave this device, and shows nothing while
 * sync works. See `OwnerSyncStatus` in `@evolu/common/local-first`. It's
 * rendered inline rather than with `Alert`, which would interrupt.
 */
const SyncStatus: FC = () => {
  // Sync state is shared by every Evolu instance created from these deps, so
  // the hook takes its store and finds this database's AppOwner in it.
  const status = useOwnerSyncStatus(deps.syncState);
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

  // iOS has no polite live region, so announce each new message explicitly.
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return message ? <Text style={styles.syncStatus}>{message}</Text> : null;
};

// Projects with their todos nested, one query for the whole list. Evolu uses
// Kysely, a query builder, not an ORM: https://kysely.dev/docs/recipes/relations
const projectsWithTodosQuery = createQuery((db) =>
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

const Projects: FC = () => {
  const [projectsWithTodos, projects] = useQueries([
    projectsWithTodosQuery,
    // The projects to move a todo to. Separate queries are cheap in
    // local-first, and this one changes less often than the todos.
    projectsQuery,
  ]);
  const { insert } = useEvolu();

  const handleAddProjectPress = () => {
    promptString("New project", "What's the project name?", null, (name) => {
      insert("project", { name });
    });
  };

  return (
    <Section title="Projects">
      {projectsWithTodos.length === 0 && (
        <Text style={styles.description}>No projects yet</Text>
      )}
      {projectsWithTodos.map((project) => (
        <ProjectTodos key={project.id} project={project} projects={projects} />
      ))}
      <Button
        title="Add Project"
        variant="primary"
        onPress={handleAddProjectPress}
      />
    </Section>
  );
};

const ProjectTodos: FC<{
  project: ProjectsWithTodosRow;
  projects: ReadonlyArray<ProjectsRow>;
}> = ({ project, projects }) => {
  const { insert, update } = useEvolu();
  const [newTodoTitle, setNewTodoTitle] = useState("");

  const handleAddTodo = () => {
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

  const handleRenamePress = () => {
    promptString("Edit project", "Project name:", project.name, (name) => {
      update("project", { id: project.id, name });
    });
  };

  const handleDeletePress = () => {
    Alert.alert("Delete project", `Delete project "${project.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        // Its todos stay as they are: queries leave out the todos of a
        // deleted project. Deleting each todo would sync a change per todo
        // and miss todos other devices haven't synced yet.
        //
        // `isDeleted` keeps the row, so restoring it is an update with
        // `sqliteFalse`; the full playground's Trash shows it.
        onPress: () => {
          update("project", { id: project.id, isDeleted: sqliteTrue });
        },
      },
    ]);
  };

  return (
    <View style={styles.project}>
      <View style={styles.row}>
        <Text style={[styles.cardTitle, styles.flex]}>{project.name}</Text>
        <TextButton title="Rename" onPress={handleRenamePress} />
        <TextButton title="Delete" onPress={handleDeletePress} />
      </View>
      {project.todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          projectId={project.id}
          projects={projects}
        />
      ))}
      <View style={styles.row}>
        <TextInput
          style={styles.textInput}
          value={newTodoTitle}
          onChangeText={setNewTodoTitle}
          onSubmitEditing={handleAddTodo}
          accessibilityLabel={`New todo in ${project.name}`}
          placeholder="Add a new todo..."
          autoComplete="off"
          placeholderTextColor="gray"
          autoCorrect={false}
          returnKeyType="done"
        />
        <Button title="Add" onPress={handleAddTodo} variant="primary" />
      </View>
    </View>
  );
};

const TodoItem: FC<{
  todo: ProjectsWithTodosRow["todos"][number];
  projectId: ProjectId;
  projects: ReadonlyArray<ProjectsRow>;
}> = ({ todo: { id, title, isCompleted }, projectId, projects }) => {
  const { update } = useEvolu();
  // An inline list of the other projects: Android's Alert shows at most three
  // buttons and drops the rest, Cancel included.
  const [isMoving, setIsMoving] = useState(false);

  const handleRenamePress = () => {
    promptString("Edit todo", "Todo title:", title, (newTitle) => {
      update("todo", { id, title: newTitle });
    });
  };

  return (
    <View>
      <View style={styles.todoItem}>
        <TouchableOpacity
          style={styles.todoCheckbox}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!isCompleted }}
          onPress={() => {
            // A mutation that can't fail needs no result check.
            update("todo", {
              id,
              isCompleted: booleanToSqliteBoolean(!isCompleted),
            });
          }}
        >
          <View
            style={[
              styles.checkbox,
              isCompleted ? styles.checkboxChecked : null,
            ]}
          />
          <Text
            style={[
              styles.todoTitle,
              isCompleted ? styles.todoTitleCompleted : null,
            ]}
          >
            {title}
          </Text>
        </TouchableOpacity>
        {projects.length > 1 && (
          <TextButton
            title="Move"
            onPress={() => {
              setIsMoving(!isMoving);
            }}
          />
        )}
        <TextButton title="Edit" onPress={handleRenamePress} />
        <TextButton
          title="Delete"
          onPress={() => {
            update("todo", { id, isDeleted: sqliteTrue });
          }}
        />
      </View>
      {isMoving && (
        <View style={styles.moveTargets}>
          <Text style={styles.detail}>Move to:</Text>
          {projects
            .filter((project) => project.id !== projectId)
            .map((project) => (
              <TextButton
                key={project.id}
                title={project.name}
                onPress={() => {
                  setIsMoving(false);
                  update("todo", { id, projectId: project.id });
                }}
              />
            ))}
          <TextButton
            title="Cancel"
            onPress={() => {
              setIsMoving(false);
            }}
          />
        </View>
      )}
    </View>
  );
};

/**
 * The AppOwners on this device, with the open one's mnemonic, the backup that
 * restores its synced data on another device or after this one loses it, and
 * deleting its data on this device. A new phone gets a new DeviceSecret, so the
 * mnemonic is how an account comes back.
 */
const Accounts: FC = () => {
  const evolu = useEvolu();
  const { appOwner } = evolu;
  const [showMnemonic, setShowMnemonic] = useState(false);

  const handleDeletePress = () => {
    Alert.alert(
      "Delete database",
      "Delete this account's database on this device? What synced comes back from the relays; changes that haven't synced yet are lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          // The AppOwner opens its database again, empty, and the relay syncs
          // back what it has.
          onPress: () => {
            void evolu.deleteDatabase().then((deleted) => {
              // After a failure, such as of files that a runtime a reload
              // replaced still holds, the instance keeps working, and deleting
              // again deletes again. Files that stay held also refuse the
              // database, which evoluError shows.
              if (
                !deleted.ok &&
                (deleted.error.type === "DatabaseHeldError" ||
                  deleted.error.type === "UnknownError")
              )
                Alert.alert("Deleting the data failed", "Try again.");
            });
          },
        },
      ],
    );
  };

  return (
    <Section title="Accounts">
      <Text style={styles.description}>
        Each account has its own data, encrypted with the account&apos;s secret,
        which its mnemonic restores on another device.
      </Text>
      <AppOwnerList openId={appOwner.id} />
      <AddAppOwnerButtons>
        <Button
          title={`${showMnemonic ? "Hide" : "Show"} Mnemonic`}
          onPress={() => {
            setShowMnemonic(!showMnemonic);
          }}
          style={styles.flex}
        />
      </AddAppOwnerButtons>
      {showMnemonic && (
        <View style={styles.mnemonicContainer}>
          <Text style={styles.mnemonicLabel}>
            Mnemonic of the open account (keep it safe)
          </Text>
          {/* Selectable text, which a disabled TextInput on Android isn't. */}
          <Text selectable style={styles.mnemonicTextArea}>
            {appOwner.mnemonic}
          </Text>
        </View>
      )}
      <Text style={styles.description}>
        You&apos;ll most likely never need this, but if this account&apos;s
        database on this device breaks, for example through faulty storage or a
        bug in the operating system, Delete Database deletes it but keeps the
        account, so you don&apos;t need its mnemonic. What synced comes back
        from the relays, and only changes that haven&apos;t synced yet are lost.
      </Text>
      <Button title="Delete Database" onPress={handleDeletePress} />
    </Section>
  );
};

const AppOwnerList: FC<{ openId: OwnerId | null }> = ({ openId }) => {
  const app = useEvoluApp();
  // The one opened most recently first.
  const appOwners = useAppOwners();
  if (appOwners.length === 0) return null;

  return (
    <View style={styles.list}>
      {appOwners.map(({ id, name, lastOpenedAt }) => (
        <View key={id} style={styles.row}>
          <EvoluIdenticon id={id} size={32} />
          <View style={styles.flex}>
            <Text style={styles.todoTitle}>
              {name ?? "Unnamed account"}
              {id === openId && " (open)"}
            </Text>
            {/* A start records no open time, as for the first AppOwner, so it shows no line until it's opened again, except while it's open. */}
            {(lastOpenedAt != null || id === openId) && (
              <Text style={styles.detail}>
                {lastOpenedAt
                  ? `Last opened ${new Date(lastOpenedAt).toLocaleString()}`
                  : "Open now"}
              </Text>
            )}
          </View>
          {id !== openId && (
            <TextButton
              title="Open"
              onPress={() => {
                app.open(id);
              }}
            />
          )}
          <TextButton
            title="Rename"
            onPress={() => {
              promptString(
                "Rename account",
                "Name this account",
                name,
                (newName) => {
                  app.rename(id, newName);
                },
              );
            }}
          />
          <TextButton
            title="Remove"
            onPress={() => {
              Alert.alert(
                `Remove ${name ?? "this unnamed account"}?`,
                "Are you sure? This removes this account from this device and deletes its data here. Changes that haven't synced are lost. Synced data comes back when you restore the mnemonic.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => {
                      void app.remove(id).then((removed) => {
                        // The app's disposal ends the call, and the removal
                        // finishes. A refused device database shows as
                        // evoluError. A removal that failed, such as of a
                        // database another context holds, finishes when it
                        // runs again.
                        if (
                          !removed.ok &&
                          (removed.error.type === "DatabaseHeldError" ||
                            removed.error.type === "UnknownError")
                        )
                          Alert.alert(
                            "Removing the account failed",
                            "Try again.",
                          );
                      });
                    },
                  },
                ],
              );
            }}
          />
        </View>
      ))}
    </View>
  );
};

/**
 * Create Account and Restore Account, whose form takes the mnemonic. Both then
 * ask for the account's name. With an account open, the row also holds that
 * account's buttons.
 */
const AddAppOwnerButtons: FC<{ children?: ReactNode }> = ({ children }) => {
  const app = useEvoluApp();
  // What the user typed into the restore form, or null while it's closed.
  const [mnemonic, setMnemonic] = useState<string | null>(null);

  if (mnemonic != null)
    return (
      <View style={styles.sectionContent}>
        <TextInput
          value={mnemonic}
          onChangeText={setMnemonic}
          accessibilityLabel="Mnemonic"
          placeholder="Mnemonic"
          placeholderTextColor="gray"
          multiline
          // A mnemonic is lowercase words, which a keyboard would capitalize
          // and correct, as Alert.prompt's would on iOS, and it's secret, so
          // the field asks for no suggestions or autofill. Whether a keyboard
          // still learns the words is up to the keyboard: React Native has no
          // prop for Android's no-personalized-learning flag.
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          importantForAutofill="no"
          style={styles.textInput}
        />
        <View style={styles.row}>
          <Button
            title="Restore"
            variant="primary"
            onPress={() => {
              // Mnemonic accepts only words separated by single spaces, as its
              // JSDoc says, but Return in this multiline field inserts a
              // newline, and a double space is easy on a phone keyboard.
              const parsed = parseStringWithAlert(
                Mnemonic,
                mnemonic.normalize("NFKD").trim().split(/\s+/u).join(" "),
              );
              if (!parsed.ok) return;
              // Opens the AppOwner and syncs its data from the relay. The form
              // keeps the mnemonic until the user confirms a name.
              addAppOwner(app, mnemonicToOwnerSecret(parsed.value), () => {
                setMnemonic(null);
              });
            }}
            style={styles.flex}
          />
          <Button
            title="Cancel"
            onPress={() => {
              setMnemonic(null);
            }}
            style={styles.flex}
          />
        </View>
      </View>
    );

  return (
    <View style={styles.row}>
      <Button
        title="Create Account"
        variant="primary"
        onPress={() => {
          addAppOwner(app, createOwnerSecret(run.deps));
        }}
        style={styles.flex}
      />
      <Button
        title="Restore Account"
        onPress={() => {
          setMnemonic("");
        }}
        style={styles.flex}
      />
      {children}
    </View>
  );
};

/**
 * Adds an AppOwner under the name the user confirms, which opens it once
 * stored, and then calls `onNamed`, or does nothing when the user cancels.
 * Adding it again is safe, and the name prefilled for an AppOwner already on
 * this device is its own, because the name the user confirms replaces it.
 */
const addAppOwner = (app: App, secret: OwnerSecret, onNamed?: () => void) => {
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
  promptString(
    "Add account",
    "Name this account",
    appOwners.find((appOwner) => appOwner.id === id)?.name ??
      `Account ${number}`,
    (name) => {
      onNamed?.();
      void app.add(secret, name).then((added) => {
        if (!added.ok && added.error.type === "UnknownError")
          Alert.alert("Adding the account failed", "Try again.");
      });
    },
  );
};

/**
 * The open AppOwner's relays, each with its connection and how far this
 * database is synced through it. SyncStatus tells the user only what needs
 * attention; this is the detail behind it.
 */
const Relays: FC = () => {
  const { name, appOwner } = useEvolu();
  // The whole snapshot, so it renders on every change, which suits a detail
  // view. For one status, `useOwnerSyncStatus` renders only when it changes.
  const syncState = useSyncExternalStore(
    deps.syncState.subscribe,
    deps.syncState.get,
    constNull,
  );
  const relays = syncStateToRelaySyncStates(syncState, name, appOwner.id);

  return (
    <Section title="Relays">
      {relays.length === 0 ? (
        <Text style={styles.description}>No relay syncs this account.</Text>
      ) : (
        relays.map((relay) => (
          <View key={relay.transport.id} style={styles.list}>
            <Text style={styles.detail}>{relay.transport.label}</Text>
            <Text style={styles.todoTitle}>
              {relaySyncStateToMessage(relay)}
            </Text>
          </View>
        ))
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
        ? `Up to date since ${new Date(relay.route.completeAt).toLocaleTimeString()}`
        : "Up to date";
    case "Syncing":
      return connection.type === "Connecting" ? "Connecting…" : "Syncing…";
    case "Disconnected":
      return connection.type === "Disconnected"
        ? `Disconnected since ${new Date(connection.disconnectedAt).toLocaleTimeString()}`
        : "Disconnected";
    case "Error":
      return `Sync error: ${status.error.type}`;
  }
};

/**
 * Disposing the app and creating it again. An export, which
 * `evolu.exportDatabase` gives as bytes, needs a file module to save and share
 * the file, such as expo-file-system and expo-sharing, which this example
 * doesn't include.
 */
const Device: FC<{ instance: number; onRestart: () => void }> = ({
  instance,
  onRestart,
}) => (
  <Section title="Device">
    <Text style={styles.description}>
      App instance #{instance}. Disposing the app and creating it again opens
      the same account and loads its data again.
    </Text>
    <Button title="Dispose and Recreate" onPress={onRestart} />
  </Section>
);

interface StringType<Output, Error extends TypeError> {
  readonly fromUnknown: (value: unknown) => Result<Output, Error>;
  readonly formatError: (error: Error) => string;
}

/** Prompts for a name or title and passes it on once it's valid. */
const promptString = (
  title: string,
  message: string,
  initialValue: string | null,
  onValid: (value: NonEmptyTrimmedString100) => void,
) => {
  Alert.prompt(
    title,
    message,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Save",
        onPress: (value?: string) => {
          if (value == null) return;
          const parsed = parseStringWithAlert(NonEmptyTrimmedString100, value);
          if (parsed.ok) onValid(parsed.value);
        },
      },
    ],
    "plain-text",
    initialValue ?? undefined,
  );
};

const parseStringWithAlert = <Output, Error extends TypeError>(
  type: StringType<Output, Error>,
  value: string,
): Result<Output, Error> => {
  const parsed = type.fromUnknown(value.trim());
  if (!parsed.ok)
    Alert.alert("Validation error", type.formatError(parsed.error));
  return parsed;
};

const Section: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <View style={styles.card} accessibilityLabel={title}>
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {title}
    </Text>
    <View style={styles.sectionContent}>{children}</View>
  </View>
);

const Button: FC<{
  title: string;
  style?: object;
  onPress: () => void;
  variant?: "primary" | "secondary";
}> = ({ title, style, onPress, variant = "secondary" }) => (
  <TouchableOpacity
    style={[
      styles.button,
      variant === "primary" ? styles.buttonPrimary : styles.buttonSecondary,
      style,
    ]}
    accessibilityRole="button"
    onPress={onPress}
  >
    <Text
      style={[
        styles.buttonText,
        variant === "primary"
          ? styles.buttonTextPrimary
          : styles.buttonTextSecondary,
      ]}
    >
      {title}
    </Text>
  </TouchableOpacity>
);

const TextButton: FC<{ title: string; onPress: () => void }> = ({
  title,
  onPress,
}) => (
  <TouchableOpacity
    style={styles.textButton}
    accessibilityRole="button"
    onPress={onPress}
  >
    <Text style={styles.textButtonText}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  maxWidthContainer: {
    maxWidth: 480,
    alignSelf: "center",
    width: "100%",
    gap: 24,
  },
  errorBanner: {
    backgroundColor: "#fef2f2",
    borderRadius: 6,
    color: "#991b1b",
    fontSize: 14,
    padding: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 12,
  },
  sectionContent: {
    gap: 12,
  },
  description: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },
  detail: {
    fontSize: 12,
    color: "#6b7280",
  },
  message: {
    color: "#111827",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  syncStatus: {
    color: "#4b5563",
    fontSize: 14,
    lineHeight: 20,
  },
  project: {
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingBottom: 12,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  moveTargets: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    paddingLeft: 28,
    paddingBottom: 4,
  },
  todoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  todoCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  todoTitle: {
    fontSize: 14,
    color: "#111827",
  },
  todoTitleCompleted: {
    color: "#6b7280",
    textDecorationLine: "line-through",
  },
  textInput: {
    flex: 1,
    borderRadius: 6,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 16,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: "#3b82f6",
  },
  buttonSecondary: {
    backgroundColor: "#f3f4f6",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  buttonTextPrimary: {
    color: "#ffffff",
  },
  buttonTextSecondary: {
    color: "#374151",
  },
  textButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  textButtonText: {
    fontSize: 13,
    color: "#2563eb",
  },
  mnemonicContainer: {
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 6,
  },
  mnemonicLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  mnemonicTextArea: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontFamily: "monospace",
    fontSize: 12,
    color: "#111827",
  },
});
