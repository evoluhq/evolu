import {
  AppName,
  createAppOwner,
  createEvoluApp,
  createIdenticon,
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
  type EvoluError,
  type EvoluSchema,
  type KyselyNotNull,
  type OwnerId,
  type OwnerSecret,
  type Result,
  type TypeError,
  type Typed,
} from "@evolu/common";
import {
  relaySyncStateToStatus,
  type RelaySyncState,
} from "@evolu/common/local-first";
import { createEvoluBinding } from "@evolu/vue";
import { createEvoluDeps, createRun } from "@evolu/web";

// A full Evolu app: projects with their todos, the AppOwners on this device,
// sync, and what the device keeps, as examples/README.md lists.

export const ProjectId = /*#__PURE__*/ id("Project");
export type ProjectId = typeof ProjectId.Output;

const TodoId = /*#__PURE__*/ id("Todo");

const Schema = {
  project: {
    id: ProjectId,
    name: NonEmptyTrimmedString100,
  },
  todo: {
    id: TodoId,
    title: NonEmptyTrimmedString100,
    isCompleted: /*#__PURE__*/ nullOr(SqliteBoolean),
    projectId: ProjectId,
  },
} satisfies EvoluSchema;

const createQuery = createQueryBuilder(Schema);

// Projects with their todos nested, one query for the whole list. Evolu uses
// Kysely, a query builder, not an ORM: https://kysely.dev/docs/recipes/relations
export const projectsWithTodosQuery = /*#__PURE__*/ createQuery((db) =>
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

export type ProjectsWithTodosRow = typeof projectsWithTodosQuery.Row;

// The projects to move a todo to. Separate queries are cheap in local-first,
// and this one changes less often than the todos.
export const projectsQuery = /*#__PURE__*/ createQuery((db) =>
  db
    .selectFrom("project")
    .select(["id", "name"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("name", "is not", null)
    .$narrowType<{ name: KyselyNotNull }>()
    .orderBy("createdAt"),
);

export type ProjectsRow = typeof projectsQuery.Row;

export const run = /*#__PURE__*/ createRun(/*#__PURE__*/ createEvoluDeps());

// Evolu creates the app's AppOwners, keeps them on this device, and opens the
// one opened last. Created once, at module scope, so a component that mounts
// again, such as after a hot update, opens no second app that nothing
// disposes. App.vue awaits it under Root.vue's Suspense.
//
// Instant start needs no prompt, but the key of the device database, which
// keeps the AppOwners' secrets, is public: anything that can read this
// browser's storage can read them. An app with sensitive data unlocks the
// device database with a passkey instead, as examples/react-vite-pwa shows;
// that logic runs before createEvoluApp and is the same in every framework.
// oxlint-disable evolu/require-pure-annotation -- Creates the application singleton and its owned runtime resources.
export const appPromise = run.orThrow(
  createEvoluApp(Schema, {
    appName: AppName.orThrow("vue-vite-pwa"),
    auth: { type: "InstantStart" },
    // The app starts with an AppOwner, which the user can remove from the
    // list, so the first start shows the app right away.
    createFirstAppOwner: true,

    // Omitted, Evolu syncs with its free relay, which is for testing.
    // `transports: []` keeps everything on this device. Sync can be added
    // later with `evolu.useOwner(evolu.appOwner, transports)`, which syncs the
    // data made before.
    ...(import.meta.env.DEV && {
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
// oxlint-enable evolu/require-pure-annotation

/**
 * The composables typed with this app's schema. Call them in component setup
 * under `EvoluAppProvider`: `useEvolu` returns the instance of the AppOwner it
 * has open, `useEvoluApp` the app, and `useQuery` takes only queries of the
 * app's tables.
 */
export const { useEvolu, useEvoluApp, useQuery } =
  /*#__PURE__*/ createEvoluBinding<typeof Schema>();

type App = EvoluApp<typeof Schema>;

/** What the user can do about an `evoluError`; see `EvoluError`. */
export const evoluErrorToMessage = (error: EvoluError): string => {
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

export const relaySyncStateToMessage = (relay: RelaySyncState): string => {
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

/**
 * An AppOwner's identicon as an image URL. It tells accounts apart without
 * showing their OwnerIds, which are secret to all but their relays.
 */
export const identiconUrl = (id: OwnerId): string =>
  `data:image/svg+xml,${encodeURIComponent(createIdenticon(id))}`;

export const formatDate = (date: string): string =>
  new Date(date).toLocaleString();

const formatTime = (millis: number): string =>
  new Date(millis).toLocaleTimeString();

interface StringType<Output, Error extends TypeError> {
  readonly fromUnknown: (value: string) => Result<Output, Error>;
  readonly formatError: (error: Error) => string;
}

interface PromptCancelledError extends Typed<"PromptCancelledError"> {}

export const promptStringWithAlert = <Output, Error extends TypeError>(
  message: string,
  type: StringType<Output, Error>,
  initialValue?: string,
): Result<Output, Error | PromptCancelledError> => {
  const value = window.prompt(message, initialValue);
  if (value == null) return err({ type: "PromptCancelledError" });
  return parseStringWithAlert(type, value);
};

export const parseStringWithAlert = <Output, Error extends TypeError>(
  type: StringType<Output, Error>,
  value: string,
): Result<Output, Error> => {
  const parsed = type.fromUnknown(value.trim());
  if (!parsed.ok) alert(type.formatError(parsed.error));
  return parsed;
};
