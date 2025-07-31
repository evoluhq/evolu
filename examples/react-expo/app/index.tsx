import {
  createEvolu,
  getOrThrow,
  id,
  kysely,
  maxLength,
  Mnemonic,
  NonEmptyString,
  NonEmptyString1000,
  nullOr,
  QueryRows,
  SimpleName,
  SqliteBoolean,
} from "@evolu/common";
import { createUseEvolu, EvoluProvider, useQuery } from "@evolu/react";
import { evoluReactNativeDeps } from "@evolu/react-native/expo-sqlite";
import { useState } from "react";
import {
  Button,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import RNPickerSelect from "react-native-picker-select";
import { SafeAreaView } from "react-native-safe-area-context";

// Let's start with typed primary keys.
const TodoId = id("Todo");
type TodoId = typeof TodoId.Type;

const TodoCategoryId = id("TodoCategory");
type TodoCategoryId = typeof TodoCategoryId.Type;

// A custom branded Type.
const NonEmptyString50 = maxLength(50)(NonEmptyString);
// string & Brand<"MinLength1"> & Brand<"MaxLength50">
type NonEmptyString50 = typeof NonEmptyString50.Type;

// Database schema
const Schema = {
  todo: {
    id: TodoId,
    title: NonEmptyString1000,
    // SQLite doesn't support the boolean type; it uses 0 (false) and 1 (true) instead.
    // SqliteBoolean provides seamless conversion.
    isCompleted: nullOr(SqliteBoolean),
    categoryId: nullOr(TodoCategoryId),
  },
  todoCategory: {
    id: TodoCategoryId,
    name: NonEmptyString50,
  },
};

const evolu = createEvolu(evoluReactNativeDeps)(Schema, {
  name: getOrThrow(SimpleName.from("evolu-expo-sqlite-example")),

  ...(process.env.NODE_ENV === "development" && {
    syncUrl: "http://localhost:4000",
  }),

  onInit: ({ isFirst }) => {
    if (isFirst) {
      const todoCategoryId = getOrThrow(
        evolu.insert("todoCategory", {
          name: "Not Urgent",
        }),
      );

      evolu.insert("todo", {
        title: "Try React Suspense",
        categoryId: todoCategoryId.id,
      });
    }
  },

  // Indexes are not required for development but are recommended for production.
  // https://www.evolu.dev/docs/indexes
  indexes: (create) => [
    create("todoCreatedAt").on("todo").column("createdAt"),
    create("todoCategoryCreatedAt").on("todoCategory").column("createdAt"),
  ],

  // enableLogging: true,
});

const useEvolu = createUseEvolu(evolu);

const todosWithCategories = evolu.createQuery(
  (db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "categoryId"])
      .where("isDeleted", "is not", 1)
      // Filter null value and ensure non-null type.
      .where("title", "is not", null)
      .$narrowType<{ title: kysely.NotNull }>()
      .orderBy("createdAt")
      // https://kysely.dev/docs/recipes/relations
      .select((eb) => [
        kysely
          .jsonArrayFrom(
            eb
              .selectFrom("todoCategory")
              .select(["todoCategory.id", "todoCategory.name"])
              .where("isDeleted", "is not", 1)
              .orderBy("createdAt"),
          )
          .as("categories"),
      ]),
  {
    // logQueryExecutionTime: true,
    // logExplainQueryPlan: true,
  },
);

type TodosWithCategoriesRow = typeof todosWithCategories.Row;

const todoCategories = evolu.createQuery((db) =>
  db
    .selectFrom("todoCategory")
    .select(["id", "name"])
    .where("isDeleted", "is not", 1)
    // Filter null value and ensure non-null type.
    .where("name", "is not", null)
    .$narrowType<{ name: kysely.NotNull }>()
    .orderBy("createdAt"),
);

type TodoCategoriesRow = typeof todoCategories.Row;

evolu.subscribeError(() => {
  const error = evolu.getError();
  // eslint-disable-next-line no-console
  console.log(error);
});

evolu.subscribeAppOwner(() => {
  // console.log(evolu.getAppOwner());
});

export default function Index(): React.ReactNode {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <EvoluProvider value={evolu}>
        <ScrollView
          keyboardDismissMode="interactive"
          style={{ flex: 1 }}
          automaticallyAdjustKeyboardInsets
        >
          <ExampleView />
        </ScrollView>
      </EvoluProvider>
    </SafeAreaView>
  );
}

function ExampleView() {
  const [text, setText] = useState("");
  const rows = useQuery(todosWithCategories);

  const { insert } = useEvolu();

  return (
    <View style={{ flex: 1, paddingHorizontal: 10 }}>
      <Text style={{ fontSize: 20, fontWeight: "600", marginVertical: 10 }}>
        Todos
      </Text>
      <TextInput
        autoComplete="off"
        autoCorrect={false}
        enterKeyHint="send"
        style={{
          height: 40,
          borderColor: "#a1a1aa",
          borderWidth: 1,
          borderRadius: 10,
          paddingInlineStart: 10,
          flexGrow: 1,
          marginBottom: 10,
        }}
        value={text}
        onChangeText={setText}
        placeholder="What needs to be done?"
        onBlur={() => {
          if (text) {
            insert("todo", {
              title: text,
            });
            setText("");
          }
        }}
      />
      {rows.map((row) => (
        <TodoItem key={row.id} row={row} />
      ))}
      <TodoCategories />
      <OwnerActions />
    </View>
  );
}

function TodoItem({ row }: { row: TodosWithCategoriesRow }) {
  const { update } = useEvolu();
  const categories = useQuery(todoCategories);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View
        style={{ flexDirection: "row", flex: 1, alignItems: "center", gap: 4 }}
      >
        <View style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}>
          <Switch
            onValueChange={() => {
              update("todo", { id: row.id, isCompleted: !row.isCompleted });
            }}
            value={!!row.isCompleted}
          />
        </View>
        <Text
          style={{
            fontSize: 16,
            textDecorationLine: row.isCompleted ? "line-through" : "none",
          }}
        >
          {row.title}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TodoCategorySelect
          categories={categories}
          selected={row.categoryId}
          onSelect={(categoryId) => {
            update("todo", { id: row.id, categoryId });
          }}
        />
        <Button
          title="Delete"
          color="red"
          onPress={() => {
            update("todo", { id: row.id, isDeleted: true });
          }}
        />
      </View>
    </View>
  );
}

function TodoCategories() {
  const categories = useQuery(todoCategories);
  const { update, insert } = useEvolu();
  const [text, setText] = useState("");

  return (
    <View style={{ marginTop: 24 }}>
      <Text style={{ fontSize: 20, fontWeight: "600", marginVertical: 10 }}>
        Categories
      </Text>
      <TextInput
        autoComplete="off"
        autoCorrect={false}
        enterKeyHint="send"
        style={{
          height: 40,
          borderColor: "#a1a1aa",
          borderWidth: 1,
          borderRadius: 10,
          paddingInlineStart: 10,
          flexGrow: 1,
          marginBottom: 10,
        }}
        value={text}
        onChangeText={setText}
        placeholder="New Category"
        onBlur={() => {
          if (text) {
            insert("todoCategory", {
              name: text,
            });
            setText("");
          }
        }}
      />
      {categories.map(({ id, name }) => (
        <View key={id} style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontSize: 16, flexGrow: 1 }}>{name}</Text>
          <View style={{ flexDirection: "row" }}>
            <Button
              title="Delete"
              color="red"
              onPress={() => {
                update("todoCategory", { id, isDeleted: true });
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function TodoCategorySelect({
  categories,
  selected,
  onSelect,
}: {
  categories: QueryRows<TodoCategoriesRow>;
  selected: TodoCategoryId | null;
  onSelect: (categoryId: TodoCategoryId | null) => void;
}) {
  return (
    <RNPickerSelect
      value={selected}
      useNativeAndroidPickerStyle={false} // fix for android
      onValueChange={(value: TodoCategoryId | null) => {
        onSelect(value);
      }}
      pickerProps={{
        mode: "dropdown",
      }}
      style={{
        inputIOSContainer: { pointerEvents: "none" }, // fix for ios
        viewContainer: {
          alignSelf: "center",
        },
      }}
      placeholder={{ label: "No Category", value: null }}
      items={categories.map(({ id, name }) => ({
        label: name || "No Category",
        value: id,
      }))}
    />
  );
}

function OwnerActions() {
  const evolu = useEvolu();
  const owner = evolu.getAppOwner();

  const [isMnemonicShown, setIsMnemonicShown] = useState(false);
  const [isRestoreShown, setIsRestoreShown] = useState(false);
  const [mnemonic, setMnemonic] = useState("");

  return (
    <View style={{ marginTop: 24 }}>
      <Text style={{ fontSize: 20, fontWeight: "600", marginVertical: 10 }}>
        Owner Actions
      </Text>
      <Text style={{ marginBottom: 10 }}>
        To sync your data across devices, open this app on another device and
        use the mnemonic phrase to restore your account. The mnemonic acts as
        your encryption key and backup.
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Button
          title={`${!isMnemonicShown ? "Show" : "Hide"} Mnemonic`}
          onPress={() => {
            setIsRestoreShown(false);
            setIsMnemonicShown(!isMnemonicShown);
          }}
        />
        <Button
          title="Restore"
          onPress={() => {
            setIsMnemonicShown(false);
            setIsRestoreShown(!isRestoreShown);
          }}
        />
        <Button
          title="Reset"
          onPress={() => {
            void evolu.resetAppOwner();
          }}
        />
      </View>

      {isMnemonicShown && owner != null && (
        <TextInput
          style={{
            borderColor: "#a1a1aa",
            borderWidth: 1,
            borderRadius: 10,
            padding: 16,
            flexGrow: 1,
            marginBottom: 10,
            fontSize: 16,
          }}
          readOnly
          autoComplete="off"
          autoCorrect={false}
          multiline
          selectTextOnFocus
        >
          {owner.mnemonic}
        </TextInput>
      )}

      {isRestoreShown && (
        <>
          <TextInput
            placeholder="insert your mnemonic"
            autoComplete="off"
            autoCorrect={false}
            style={{
              borderColor: "#a1a1aa",
              borderWidth: 1,
              borderRadius: 10,
              padding: 16,
              flexGrow: 1,
              fontSize: 16,
            }}
            value={mnemonic}
            onChangeText={setMnemonic}
          />
          <Button
            title="Restore"
            onPress={() => {
              void evolu.restoreAppOwner(mnemonic as Mnemonic, {
                reload: true,
              });
            }}
          />
        </>
      )}
    </View>
  );
}
