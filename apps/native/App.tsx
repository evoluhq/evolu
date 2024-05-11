import * as S from "@effect/schema/Schema";
import { formatError } from "@effect/schema/TreeFormatter";
import {
  EvoluProvider,
  NonEmptyString1000,
  NotNull,
  SqliteBoolean,
  String,
  cast,
  createEvolu,
  createIndexes,
  database,
  id,
  jsonArrayFrom,
  parseMnemonic,
  table,
  useEvolu,
  useEvoluError,
  useOwner,
  useQuery,
} from "@evolu/react-native";
import { Effect, Either, Exit, Function } from "effect";
import {
  FC,
  Suspense,
  memo,
  startTransition,
  useEffect,
  useState,
} from "react";
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import RNPickerSelect from "react-native-picker-select";

// Let's start with the database schema.

// Every table needs Id. It's defined as a branded type.
// Branded types make database types super safe.
const TodoId = id("Todo");
type TodoId = typeof TodoId.Type;

const TodoCategoryId = id("TodoCategory");
type TodoCategoryId = typeof TodoCategoryId.Type;

// This branded type ensures a string must be validated before being put
// into the database.
const NonEmptyString50 = String.pipe(
  S.minLength(1),
  S.maxLength(50),
  S.brand("NonEmptyString50"),
);
type NonEmptyString50 = typeof NonEmptyString50.Type;

// Now we can define tables.
const TodoTable = table({
  id: TodoId,
  title: NonEmptyString1000,
  isCompleted: S.NullOr(SqliteBoolean),
  categoryId: S.NullOr(TodoCategoryId),
});
type TodoTable = typeof TodoTable.Type;

// Evolu tables can contain typed JSONs.
const SomeJson = S.Struct({ foo: S.String, bar: S.Boolean });
type SomeJson = typeof SomeJson.Type;

const TodoCategoryTable = table({
  id: TodoCategoryId,
  name: NonEmptyString50,
  json: S.NullOr(SomeJson),
});
type TodoCategoryTable = typeof TodoCategoryTable.Type;

// Now, we can define the database schema.
const Database = database({
  todo: TodoTable,
  todoCategory: TodoCategoryTable,
});
type Database = typeof Database.Type;

/**
 * Indexes are not necessary for development but are required for production.
 * Before adding an index, use `logExecutionTime` and `logExplainQueryPlan`
 * createQuery options.
 *
 * See https://www.evolu.dev/docs/indexes
 */
const indexes = createIndexes((create) => [
  create("indexTodoCreatedAt").on("todo").column("createdAt"),
  create("indexTodoCategoryCreatedAt").on("todoCategory").column("createdAt"),
]);

const evolu = createEvolu(Database, {
  indexes,
  ...(process.env.NODE_ENV === "development" && {
    syncUrl: "http://localhost:4000",
  }),
  initialData: (evolu) => {
    const { id: categoryId } = evolu.create("todoCategory", {
      name: S.decodeSync(NonEmptyString50)("Not Urgent"),
    });
    evolu.create("todo", {
      title: S.decodeSync(NonEmptyString1000)("Try React Suspense"),
      categoryId,
    });
  },
  // minimumLogLevel: "trace",
});

export default function App(): JSX.Element {
  return (
    <ScrollView style={appStyles.container}>
      <Text style={appStyles.h1}>React Native Example</Text>
      <ReactNativeExample />
    </ScrollView>
  );
}

const ReactNativeExample: FC = () => {
  const [todosShown, setTodosShown] = useState(true);

  return (
    <EvoluProvider value={evolu}>
      <OwnerActions />
      <View style={{ alignItems: "flex-start" }}>
        <Button
          title="Simulate suspense-enabled router"
          onPress={() => {
            // https://react.dev/reference/react/useTransition#building-a-suspense-enabled-router
            startTransition(() => {
              setTodosShown(!todosShown);
            });
          }}
        />
        <Text>
          Using suspense-enabled router transition, you will not see any loader
          or jumping content.
        </Text>
      </View>
      <Suspense>{todosShown ? <Todos /> : <TodoCategories />}</Suspense>
      <NotificationBar />
    </EvoluProvider>
  );
};

const OwnerActions: FC = () => {
  const evolu = useEvolu<Database>();
  const owner = useOwner();
  const [isMnemonicShown, setIsMnemonicShown] = useState(false);
  const [isRestoreShown, setIsRestoreShown] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const parsedMnemonic = S.decodeUnknownEither(NonEmptyString1000)(mnemonic);

  const handleMnemonicInputEndEditing = () => {
    Either.match(parsedMnemonic, {
      onLeft: (error) => alert(formatError(error)),
      onRight: (mnemonic) => {
        parseMnemonic(mnemonic)
          .pipe(Effect.runPromiseExit)
          .then(
            Exit.match({
              onFailure: (error) => {
                alert(JSON.stringify(error, null, 2));
              },
              onSuccess: evolu.restoreOwner,
            }),
          );
      },
    });
  };

  return (
    <View>
      <Text>
        Open this page on a different device and use your mnemonic to restore
        your data.
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
        <Button
          title={`${!isMnemonicShown ? "Show" : "Hide"} Mnemonic`}
          onPress={() => setIsMnemonicShown(!isMnemonicShown)}
        />
        <Button
          title="Restore"
          onPress={() => setIsRestoreShown(!isRestoreShown)}
        />
        <Button
          title="Reset"
          onPress={() => {
            evolu.resetOwner();
          }}
        />
      </View>
      {isMnemonicShown && owner != null && (
        <TextInput multiline selectTextOnFocus>
          {owner.mnemonic}
        </TextInput>
      )}
      {isRestoreShown && (
        <TextInput
          placeholder="insert your mnemonic"
          autoComplete="off"
          autoCorrect={false}
          style={appStyles.textInput}
          value={mnemonic}
          onChangeText={setMnemonic}
          onEndEditing={handleMnemonicInputEndEditing}
        />
      )}
    </View>
  );
};

// Evolu queries should be collocated. If necessary, they can be preloaded.
const todosWithCategories = evolu.createQuery(
  (db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "categoryId"])
      .where("isDeleted", "is not", cast(true))
      // Filter null value and ensure non-null type.
      .where("title", "is not", null)
      .$narrowType<{ title: NotNull }>()
      .orderBy("createdAt")
      // https://kysely.dev/docs/recipes/relations
      .select((eb) => [
        jsonArrayFrom(
          eb
            .selectFrom("todoCategory")
            .select(["todoCategory.id", "todoCategory.name"])
            .where("isDeleted", "is not", cast(true))
            .orderBy("createdAt"),
        ).as("categories"),
      ]),
  {
    // logQueryExecutionTime: true,
    // logExplainQueryPlan: true,
  },
);

const Todos: FC = () => {
  const { rows } = useQuery(todosWithCategories);
  const { create } = useEvolu<Database>();

  const [text, setText] = useState("");
  const newTodoTitle = S.decodeUnknownEither(NonEmptyString1000)(text);
  const handleTextInputEndEditing = () => {
    Either.match(newTodoTitle, {
      onLeft: Function.constVoid,
      onRight: (title) => {
        create("todo", { title, isCompleted: false });
        setText("");
      },
    });
  };

  return (
    <>
      <Text style={appStyles.h2}>Todos</Text>
      <TextInput
        autoComplete="off"
        autoCorrect={false}
        style={appStyles.textInput}
        value={text}
        onChangeText={setText}
        placeholder="What needs to be done?"
        onEndEditing={handleTextInputEndEditing}
      />
      <View>
        {rows.map((row) => (
          <TodoItem key={row.id} row={row} />
        ))}
      </View>
    </>
  );
};

const TodoItem = memo<{
  row: Pick<TodoTable, "id" | "title" | "isCompleted" | "categoryId"> & {
    categories: ReadonlyArray<TodoCategoryForSelect>;
  };
}>(function TodoItem({
  row: { id, title, isCompleted, categoryId, categories },
}) {
  const { update } = useEvolu<Database>();

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row" }}>
        <Text
          style={[
            appStyles.item,
            { textDecorationLine: isCompleted ? "line-through" : "none" },
          ]}
        >
          {title}
        </Text>
        <TodoCategorySelect
          categories={categories}
          selected={categoryId}
          onSelect={(categoryId) => {
            update("todo", { id, categoryId });
          }}
        />
      </View>
      <View style={{ flexDirection: "row" }}>
        <Button
          title={isCompleted ? "Completed" : "Complete"}
          onPress={() => {
            update("todo", { id, isCompleted: !isCompleted });
          }}
        />
        <Button
          title="Delete"
          onPress={() => {
            update("todo", { id, isDeleted: true });
          }}
        />
      </View>
    </View>
  );
});

const TodoCategorySelect: FC<{
  categories: ReadonlyArray<TodoCategoryForSelect>;
  selected: TodoCategoryId | null;
  onSelect: (_value: TodoCategoryId | null) => void;
}> = ({ categories, selected, onSelect }) => {
  const nothingSelected = "";
  const value =
    selected && categories.find((row) => row.id === selected)
      ? selected
      : nothingSelected;

  return (
    <RNPickerSelect
      value={value}
      onValueChange={(value: TodoCategoryId | null) => {
        onSelect(value);
      }}
      items={categories.map((row) => ({
        label: row.name || "",
        value: row.id,
      }))}
    />
  );
};

interface TodoCategoryForSelect {
  readonly id: TodoCategoryTable["id"];
  readonly name: TodoCategoryTable["name"] | null;
}

const todoCategories = evolu.createQuery((db) =>
  db
    .selectFrom("todoCategory")
    .select(["id", "name", "json"])
    .where("isDeleted", "is not", cast(true))
    // Filter null value and ensure non-null type.
    .where("name", "is not", null)
    .$narrowType<{ name: NotNull }>()
    .orderBy("createdAt"),
);

const TodoCategories: FC = () => {
  const { create, update } = useEvolu<Database>();
  const { rows } = useQuery(todoCategories);

  const [text, setText] = useState("");
  const newTodoTitle = S.decodeUnknownEither(NonEmptyString50)(text);
  const handleTextInputEndEditing = () => {
    Either.match(newTodoTitle, {
      onLeft: Function.constVoid,
      onRight: (name) => {
        create("todoCategory", {
          name,
          json: { foo: "a", bar: false },
        });
        setText("");
      },
    });
  };

  return (
    <>
      <Text style={appStyles.h2}>Categories</Text>
      <TextInput
        autoComplete="off"
        autoCorrect={false}
        style={appStyles.textInput}
        value={text}
        onChangeText={setText}
        placeholder="New Category"
        onEndEditing={handleTextInputEndEditing}
      />
      {rows.map(({ id, name }) => (
        <View key={id} style={{ marginBottom: 16 }}>
          <Text style={appStyles.item}>{name}</Text>
          <View style={{ flexDirection: "row" }}>
            <Button
              title="Delete"
              onPress={() => {
                update("todoCategory", { id, isDeleted: true });
              }}
            />
          </View>
        </View>
      ))}
    </>
  );
};

const NotificationBar: FC = () => {
  const evoluError = useEvoluError();
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (evoluError) setShowError(true);
  }, [evoluError]);

  if (!evoluError || !showError) return null;

  return (
    <View>
      <Text>{`Error: ${JSON.stringify(evoluError)}`}</Text>
      <Button title="Close" onPress={() => setShowError(false)} />
    </View>
  );
};

const appStyles = StyleSheet.create({
  h1: {
    fontSize: 24,
    marginVertical: 16,
  },
  h2: {
    fontSize: 18,
    marginVertical: 16,
  },
  item: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 16,
  },
  textInput: {
    fontSize: 18,
    marginBottom: 16,
  },
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
});
