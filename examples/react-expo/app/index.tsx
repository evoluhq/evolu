import * as Evolu from "@evolu/common";
import {
  createUseEvolu,
  EvoluProvider,
  useAppOwner,
  useQuery,
} from "@evolu/react";
import { evoluReactNativeDeps } from "@evolu/react-native/expo-sqlite";
import { FC, Suspense, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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

// Create Evolu instance for the React Native platform.
const evolu = Evolu.createEvolu(evoluReactNativeDeps)(Schema, {
  name: Evolu.SimpleName.orThrow("evolu-expo-minimal"),

  ...(process.env.NODE_ENV === "development" && {
    transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
  }),
});

// Creates a typed React Hook returning an instance of Evolu.
const useEvolu = createUseEvolu(evolu);

// Evolu uses Kysely for type-safe SQL (https://kysely.dev/).
const todosQuery = evolu.createQuery((db) =>
  db
    // Type-safe SQL: enjoy autocomplete for table and column names here.
    .selectFrom("todo")
    .select(["id", "title", "isCompleted"])
    // Soft delete: filter out deleted rows (isDeleted is auto-added to all tables).
    .where("isDeleted", "is not", Evolu.sqliteTrue)
    // Like GraphQL, Evolu schema makes everything nullable except id. This
    // enables schema evolution (no migrations/versioning) and handles eventual
    // consistency. Filter nulls in queries to ensure required shape.
    .where("title", "is not", null)
    .$narrowType<{ title: Evolu.kysely.NotNull }>()
    .orderBy("createdAt"),
);

// Extract the row type from the query for type-safe component props.
type TodosRow = typeof todosQuery.Row;

/**
 * Subscribe to unexpected Evolu errors (database, network, sync issues). These
 * should not happen in normal operation, so always log them for debugging. Show
 * users a friendly error message instead of technical details.
 */
evolu.subscribeError(() => {
  const error = evolu.getError();
  if (!error) return;

  Alert.alert("🚨 Evolu error occurred! Check the console.");
  // eslint-disable-next-line no-console
  console.error(error);
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

export default function Index(): React.ReactNode {
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
            </Suspense>
          </EvoluProvider>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
  const appOwner = useAppOwner();
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
});
