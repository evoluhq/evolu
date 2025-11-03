import * as Evolu from "@evolu/common";
import { createUseEvolu, EvoluProvider, useQuery } from "@evolu/react";
import { evoluReactNativeDeps, localAuth, EvoluAvatar } from "@evolu/react-native/expo-sqlite";
import { FC, Suspense, use, useEffect, useMemo, useState } from "react";
import type { Evolu as EvoluType } from "@evolu/common";

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Alert from "@blazejkustra/react-native-alert";

// Namespace for the current app (scopes databases, passkeys, etc.)
const service = "rn-expo";

// Primary keys are branded types, preventing accidental use of IDs across
// different tables (e.g., a TodoId can't be used where a UserId is expected).
const TodoId = Evolu.id("Todo");
type TodoId = typeof TodoId.Type;

// Schema defines database structure with runtime validation.
// Column types validate data on insert/update/upsert.
const Schema = {
  todo: {
    id: TodoId,
    // Branded type ensuring titles are non-empty and ≤100 chars.
    title: Evolu.NonEmptyString100,
    // SQLite doesn't support the boolean type; it uses 0 and 1 instead.
    isCompleted: Evolu.nullOr(Evolu.SqliteBoolean),
  },
};

export default function Index(): React.ReactNode {
  const [authResult, setAuthResult] = useState<Evolu.AuthResult | null>(null);
  const [ownerIds, setOwnerIds] = useState<Array<Evolu.AuthList> | null>(null);
  const [evolu, setEvolu] = useState<EvoluType<typeof Schema> | null>(null);

  useEffect(() => {
    (async () => {
      const authResult = await localAuth.getOwner({ service });
      const ownerIds = await localAuth.getProfiles({ service });
      const evolu = Evolu.createEvolu(evoluReactNativeDeps)(Schema, {
        name: Evolu.SimpleName.orThrow(
          `${service}-${authResult?.owner?.id ?? "guest"}`,
        ),
        encryptionKey: authResult?.owner?.encryptionKey,
        externalAppOwner: authResult?.owner,
        ...(process.env.NODE_ENV === "development" && {
          transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
        }),
      });

      setEvolu(evolu as EvoluType<typeof Schema>);
      setOwnerIds(ownerIds);
      setAuthResult(authResult);

      /**
       * Subscribe to unexpected Evolu errors (database, network, sync issues). These
       * should not happen in normal operation, so always log them for debugging. Show
       * users a friendly error message instead of technical details.
       */
      return evolu.subscribeError(() => {
        const error = evolu.getError();
        if (!error) return;
        Alert.alert("🚨 Evolu error occurred! Check the console.");
        // eslint-disable-next-line no-console
        console.error(error);
      });
    })().catch((error) => {
      console.error(error);
    });
  }, []);

  if (evolu == null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <EvoluProvider value={evolu}>
      <EvoluDemo
        evolu={evolu}
        ownerIds={ownerIds}
        authResult={authResult}
      />
    </EvoluProvider>
  );
}

function EvoluDemo({
  evolu,
  ownerIds,
  authResult,
}: {
  evolu: EvoluType<typeof Schema>;
  ownerIds: Array<Evolu.AuthList> | null;
  authResult: Evolu.AuthResult | null;
}): React.ReactNode {
  const useEvolu = createUseEvolu(evolu);

  // Evolu uses Kysely for type-safe SQL (https://kysely.dev/).
  const todosQuery = evolu.createQuery((db) =>
    db
      // Type-safe SQL: try autocomplete for table and column names.
      .selectFrom("todo")
      .select(["id", "title", "isCompleted"])
      // Soft delete: filter out deleted rows.
      .where("isDeleted", "is not", Evolu.sqliteTrue)
      // Like GraphQL, all columns except id are nullable in queries (even if
      // defined as non-nullable in schema). This enables schema evolution (no
      // migrations/versioning). Filter nulls with where + $narrowType.
      .where("title", "is not", null)
      .$narrowType<{ title: Evolu.kysely.NotNull }>()
      // Columns createdAt, updatedAt, isDeleted are auto-added to all tables.
      .orderBy("createdAt"),
  );

  // Extract the row type from the query for type-safe component props.
  type TodosRow = typeof todosQuery.Row;

  const Todos: FC = () => {
    // useQuery returns live data - component re-renders when data changes.
    const todos = useQuery(todosQuery);
    const { insert } = useEvolu();
    const [newTodoTitle, setNewTodoTitle] = useState("");

    const handleAddTodo = () => {
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
        Alert.alert("Error", formatTypeError(result.error));
      }
    };

    return (
      <View
        style={[styles.todosContainer, { paddingTop: todos.length > 0 ? 6 : 24 }]}
      >
        <View
          style={[
            styles.todosList,
            { display: todos.length > 0 ? "flex" : "none" },
          ]}
        >
          {todos.map((todo) => (
            <TodoItem key={todo.id} row={todo} />
          ))}
        </View>

        <View style={styles.addTodoContainer}>
          <TextInput
            style={styles.textInput}
            value={newTodoTitle}
            onChangeText={setNewTodoTitle}
            onSubmitEditing={handleAddTodo}
            placeholder="Add a new todo..."
            autoComplete="off"
            placeholderTextColor={"gray"}
            autoCorrect={false}
            returnKeyType="done"
          />
          <CustomButton title="Add" onPress={handleAddTodo} variant="primary" />
        </View>
      </View>
    );
  };

  const TodoItem: FC<{
    row: TodosRow;
  }> = ({ row: { id, title, isCompleted } }) => {
    const { update } = useEvolu();

    const handleToggleCompletedPress = () => {
      update("todo", {
        id,
        // Number converts boolean to number.
        isCompleted: Number(!isCompleted),
      });
    };

    const handleRenamePress = () => {
      Alert.prompt(
        "Edit Todo",
        "Enter new title:",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save",
            onPress: (newTitle?: string) => {
              if (newTitle != null && newTitle.trim()) {
                const result = update("todo", { id, title: newTitle.trim() });
                if (!result.ok) {
                  Alert.alert("Error", formatTypeError(result.error));
                }
              }
            },
          },
        ],
        "plain-text",
        title,
      );
    };

    const handleDeletePress = () => {
      update("todo", {
        id,
        // Soft delete with isDeleted flag (CRDT-friendly, preserves sync history).
        isDeleted: Evolu.sqliteTrue,
      });
    };

    return (
      <View style={styles.todoItem}>
        <TouchableOpacity
          style={styles.todoCheckbox}
          onPress={handleToggleCompletedPress}
        >
          <View
            style={[styles.checkbox, isCompleted ? styles.checkboxChecked : null]}
          >
            <Text
              style={[
                styles.checkmark,
                { display: isCompleted ? "flex" : "none" },
              ]}
            >
              ✓
            </Text>
          </View>
          <Text
            style={[
              styles.todoTitle,
              isCompleted ? styles.todoTitleCompleted : null,
            ]}
          >
            {title}
          </Text>
        </TouchableOpacity>

        <View style={styles.todoActions}>
          <TouchableOpacity
            onPress={handleRenamePress}
            style={styles.actionButton}
          >
            <Text style={styles.editIcon}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDeletePress}
            style={styles.actionButton}
          >
            <Text style={styles.deleteIcon}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const OwnerActions: FC = () => {
    const evolu = useEvolu();
    const appOwner = use(evolu.appOwner);
    const [showMnemonic, setShowMnemonic] = useState(false);

    // Restore owner from mnemonic to sync data across devices.
    const handleRestoreAppOwnerPress = () => {
      Alert.prompt(
        "Restore Account",
        "Enter your mnemonic to restore your data:",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            onPress: (mnemonic?: string) => {
              if (mnemonic == null) return;

              const result = Evolu.Mnemonic.from(mnemonic.trim());
              if (!result.ok) {
                Alert.alert("Error", formatTypeError(result.error));
                return;
              }

              void evolu.restoreAppOwner(result.value);
            },
          },
        ],
        "plain-text",
      );
    };

    const handleResetAppOwnerPress = () => {
      Alert.alert(
        "Reset All Data",
        "Are you sure? This will delete all your local data.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reset",
            style: "destructive",
            onPress: () => {
              void evolu.resetAppOwner();
            },
          },
        ],
      );
    };

    return (
      <View style={styles.ownerActionsContainer}>
        <Text style={styles.sectionTitle}>Account</Text>
        {appOwner && (
          <View style={styles.ownerProfileContainer}>
            <OwnerProfile
              ownerId={appOwner.id}
              username={authResult?.username ?? "Guest"}
            />
          </View>
        )}
        <Text style={styles.sectionDescription}>
          Todos are stored in local SQLite. When you sync across devices, your
          data is end-to-end encrypted using your mnemonic.
        </Text>

        <View style={styles.ownerActionsButtons}>
          <CustomButton
            title={`${showMnemonic ? "Hide" : "Show"} Mnemonic`}
            onPress={() => {
              setShowMnemonic(!showMnemonic);
            }}
            style={styles.fullWidthButton}
          />

          {showMnemonic && appOwner?.mnemonic && (
            <View style={styles.mnemonicContainer}>
              <Text style={styles.mnemonicLabel}>
                Your Mnemonic (keep this safe!)
              </Text>
              <TextInput
                value={appOwner.mnemonic}
                editable={false}
                multiline
                style={styles.mnemonicTextArea}
              />
            </View>
          )}

          <View style={styles.actionButtonsRow}>
            <CustomButton
              title="Restore from Mnemonic"
              onPress={handleRestoreAppOwnerPress}
              style={styles.flexButton}
            />
            <CustomButton
              title="Reset All Data"
              onPress={handleResetAppOwnerPress}
              style={styles.flexButton}
            />
          </View>
        </View>
      </View>
    );
  };

  const AuthActions: FC = () => {
    const appOwner = use(evolu.appOwner);
    const otherOwnerIds = useMemo(
      () => ownerIds?.filter(({ ownerId }) => ownerId !== appOwner?.id) ?? [],
      [appOwner?.id, ownerIds],
    );
  
    // Create a new owner and register it to a passkey.
    const handleRegisterPress = async () => {
      Alert.prompt(
        "Register Passkey",
        "Enter your username:",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Register",
            onPress: async (username?: string) => {
              if (username == null) return;
  
              // Determine if this is a guest login or a new owner.
              const isGuest = !Boolean(authResult?.owner);
  
              // Register the guest owner or create a new one if this is already registered.
              const mnemonic = isGuest ? appOwner?.mnemonic : undefined;
              const result = await localAuth.register(
                username,
                { service, mnemonic },
              );
              if (result) {
                // If this is a guest owner, we should clear the database and reload.
                // The owner is transferred to a new database on next login.
                if (isGuest) {
                  evolu.resetAppOwner({ reload: true });
                  // Otherwise, just reload the app (in RN, we can't reload like web)
                } else {
                  evolu.reloadApp();
                }
              } else {
                Alert.alert("Error", "Failed to register profile");
              }
            },
          },
        ],
        "plain-text",
      );
    };
  
    // Login with a specific owner id using the registered passkey.
    const handleLoginPress = async (ownerId: Evolu.OwnerId) => {
      const result = await localAuth.login(ownerId, { service });
      if (result) {
        evolu.reloadApp();
      } else {
        Alert.alert("Error", "Failed to login");
      }
    };
  
    // Clear all data including passkeys and metadata.
    const handleClearAllPress = async () => {
      Alert.alert(
        "Clear All Data",
        "Are you sure you want to clear all data? This will remove all passkeys and cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Clear",
            style: "destructive",
            onPress: async () => {
              await localAuth.clearAll({ service });
              void evolu.resetAppOwner({ reload: true });
            },
          },
        ],
      );
    };
  
    return (
      <View style={styles.authActionsContainer}>
        <Text style={styles.sectionTitle}>Passkeys</Text>
        <Text style={styles.sectionDescription}>
          Register a new passkey or choose a previously registered one.
        </Text>
        <View style={styles.actionButtonsRow}>
          <CustomButton
            title="Register Passkey"
            onPress={handleRegisterPress}
            style={styles.flexButton}
          />
          <CustomButton
            title="Clear All"
            onPress={handleClearAllPress}
            style={styles.flexButton}
          />
        </View>
        {otherOwnerIds.length > 0 && (
          <View style={styles.otherOwnersContainer}>
            {otherOwnerIds.map(({ ownerId, username }) => (
              <OwnerProfile
                key={ownerId}
                ownerId={ownerId}
                username={username}
                handleLoginPress={handleLoginPress}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  const OwnerProfile: FC<{
    ownerId: Evolu.OwnerId;
    username: string;
    handleLoginPress?: (ownerId: Evolu.OwnerId) => void;
  }> = ({ ownerId, username, handleLoginPress }) => {
    return (
      <View style={styles.ownerProfileRow}>
        <View style={styles.ownerInfo}>
          <EvoluAvatar id={ownerId} />
          <View style={styles.ownerDetails}>
            <Text style={styles.ownerUsername}>{username}</Text>
            <Text style={styles.ownerIdText} numberOfLines={1} ellipsizeMode="middle">
              {ownerId as string}
            </Text>
          </View>
        </View>
        {handleLoginPress && (
          <CustomButton
            title="Login"
            onPress={() => handleLoginPress(ownerId)}
            style={styles.loginButton}
          />
        )}
      </View>
    );
  };

  const CustomButton: FC<{
    title: string;
    style?: any;
    onPress: () => void;
    variant?: "primary" | "secondary";
  }> = ({ title, style, onPress, variant = "secondary" }) => {
    const buttonStyle = [
      styles.button,
      variant === "primary" ? styles.buttonPrimary : styles.buttonSecondary,
      style,
    ];

    const textStyle = [
      styles.buttonText,
      variant === "primary"
        ? styles.buttonTextPrimary
        : styles.buttonTextSecondary,
    ];

    return (
      <TouchableOpacity style={buttonStyle} onPress={onPress}>
        <Text style={textStyle}>{title}</Text>
      </TouchableOpacity>
    );
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.maxWidthContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Minimal Todo App (Evolu + Expo)</Text>
          </View>
          <EvoluProvider value={evolu}>
            {/*
              Suspense delivers great UX (no loading flickers) and DX (no loading
              states to manage). Highly recommended with Evolu.
            */}
            <Suspense>
              <Todos />
              <OwnerActions />
              <AuthActions />
            </Suspense>
          </EvoluProvider>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
    paddingHorizontal: 32,
    paddingVertical: 32,
  },
  maxWidthContainer: {
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  header: {
    marginBottom: 8,
    paddingBottom: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  todosContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 24,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  todosList: {
    marginBottom: 24,
  },
  todoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: -8,
    marginHorizontal: -8,
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
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
  },
  todoTitle: {
    fontSize: 14,
    color: "#111827",
    flex: 1,
  },
  todoTitleCompleted: {
    color: "#6b7280",
    textDecorationLine: "line-through",
  },
  todoActions: {
    flexDirection: "row",
    gap: 4,
  },
  actionButton: {
    padding: 4,
  },
  editIcon: {
    fontSize: 16,
  },
  deleteIcon: {
    fontSize: 16,
  },
  addTodoContainer: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: -8,
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
  ownerActionsContainer: {
    marginTop: 32,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 24,
    paddingTop: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 16,
  },
  sectionDescription: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
    lineHeight: 20,
  },
  ownerActionsButtons: {
    gap: 12,
  },
  fullWidthButton: {
    width: "100%",
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
  actionButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  flexButton: {
    flex: 1,
  },
  authActionsContainer: {
    marginTop: 32,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 24,
    paddingTop: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  ownerProfileContainer: {
    marginBottom: 16,
  },
  ownerProfileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    marginBottom: 8,
  },
  ownerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
    marginRight: 12,
  },
  ownerDetails: {
    flex: 1,
  },
  ownerUsername: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 2,
  },
  ownerIdText: {
    fontSize: 10,
    color: "#6b7280",
    fontStyle: "italic",
  },
  loginButton: {
    paddingHorizontal: 16,
  },
  otherOwnersContainer: {
    marginTop: 16,
  },
});

/**
 * Formats Evolu Type errors into user-friendly messages.
 *
 * Evolu Type typed errors ensure every error type used in schema must have a
 * formatter. TypeScript enforces this at compile-time, preventing unhandled
 * validation errors from reaching users.
 *
 * The `createFormatTypeError` function handles both built-in and custom errors,
 * and lets us override default formatting for specific errors.
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
