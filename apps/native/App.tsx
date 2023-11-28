import * as S from "@effect/schema/Schema";
import * as TreeFormatter from "@effect/schema/TreeFormatter";
import * as Evolu from "@evolu/react-native";
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

const TodoId = Evolu.id("Todo");
type TodoId = S.Schema.To<typeof TodoId>;

const TodoCategoryId = Evolu.id("TodoCategory");
type TodoCategoryId = S.Schema.To<typeof TodoCategoryId>;

const NonEmptyString50 = Evolu.String.pipe(
  S.minLength(1),
  S.maxLength(50),
  S.brand("NonEmptyString50"),
);
type NonEmptyString50 = S.Schema.To<typeof NonEmptyString50>;

const TodoTable = S.struct({
  id: TodoId,
  title: Evolu.NonEmptyString1000,
  isCompleted: Evolu.SqliteBoolean,
  categoryId: S.nullable(TodoCategoryId),
});
type TodoTable = S.Schema.To<typeof TodoTable>;

const SomeJson = S.struct({ foo: S.string, bar: S.boolean });
type SomeJson = S.Schema.To<typeof SomeJson>;

const TodoCategoryTable = S.struct({
  id: TodoCategoryId,
  name: NonEmptyString50,
  json: SomeJson,
});
type TodoCategoryTable = S.Schema.To<typeof TodoCategoryTable>;

const Database = S.struct({
  todo: TodoTable,
  todoCategory: TodoCategoryTable,
});

const evolu = Evolu.create(Database, {
  ...(process.env.NODE_ENV === "development" && {
    syncUrl: "http://localhost:4000",
  }),
});

// React Hooks
const { useEvolu, useEvoluError, useQuery, useOwner } = evolu;

export default function App(): JSX.Element {
  return (
    <ScrollView style={appStyles.container}>
      <Text style={appStyles.h1}>React Native Example</Text>
      <NextJsExample />
    </ScrollView>
  );
}

const NextJsExample: FC = () => {
  const [todosShown, setTodosShown] = useState(true);

  return (
    <>
      <OwnerActions />
      <View style={{ alignItems: "flex-start" }}>
        <Button
          title="Simulate suspense-enabled router"
          onPress={(): void => {
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
    </>
  );
};

const OwnerActions: FC = () => {
  const evolu = useEvolu();
  const owner = useOwner();
  const [isMnemonicShown, setIsMnemonicShown] = useState(false);
  const [isRestoreShown, setIsRestoreShown] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const parsedMnemonic = S.parseEither(Evolu.NonEmptyString1000)(mnemonic);

  const handleMnemonicInputEndEditing = (): void => {
    Either.match(parsedMnemonic, {
      onLeft: (error) => alert(TreeFormatter.formatErrors(error.errors)),
      onRight: (mnemonic) => {
        Evolu.parseMnemonic(mnemonic)
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
          onPress={(): void => setIsMnemonicShown(!isMnemonicShown)}
        />
        <Button
          title="Restore"
          onPress={(): void => setIsRestoreShown(!isRestoreShown)}
        />
        <Button
          title="Reset"
          onPress={(): void => {
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

const todosWithCategories = evolu.createQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted", "categoryId"])
    .where("isDeleted", "is not", Evolu.cast(true))
    // Filter null values and ensure non-null types. Evolu will provide a helper.
    .where("title", "is not", null)
    .where("isCompleted", "is not", null)
    .$narrowType<{ title: Evolu.NonEmptyString1000 }>()
    .$narrowType<{ isCompleted: Evolu.SqliteBoolean }>()
    .orderBy("createdAt")
    // https://kysely.dev/docs/recipes/relations
    .select((eb) => [
      Evolu.jsonArrayFrom(
        eb
          .selectFrom("todoCategory")
          .select(["todoCategory.id", "todoCategory.name"])
          .where("isDeleted", "is not", Evolu.cast(true))
          .orderBy("createdAt"),
      ).as("categories"),
    ]),
);

const Todos: FC = () => {
  const { create } = useEvolu();
  const { rows } = useQuery(todosWithCategories);

  const [text, setText] = useState("");
  const newTodoTitle = S.parseEither(Evolu.NonEmptyString1000)(text);
  const handleTextInputEndEditing = (): void => {
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
  const { update } = useEvolu();

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
          onSelect={(categoryId): void => {
            update("todo", { id, categoryId });
          }}
        />
      </View>
      <View style={{ flexDirection: "row" }}>
        <Button
          title={isCompleted ? "Completed" : "Complete"}
          onPress={(): void => {
            update("todo", { id, isCompleted: !isCompleted });
          }}
        />
        <Button
          title="Delete"
          onPress={(): void => {
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
      onValueChange={(value: TodoCategoryId | null): void => {
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
    .where("isDeleted", "is not", Evolu.cast(true))
    // Filter null value and ensure non-null type. Evolu will provide a helper.
    .where("name", "is not", null)
    .$narrowType<{ name: NonEmptyString50 }>()
    .orderBy("createdAt"),
);

const TodoCategories: FC = () => {
  const { create, update } = useEvolu();
  const { rows } = useQuery(todoCategories);

  const [text, setText] = useState("");
  const newTodoTitle = S.parseEither(NonEmptyString50)(text);
  const handleTextInputEndEditing = (): void => {
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
              onPress={(): void => {
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
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (evoluError) setShown(true);
  }, [evoluError]);

  if (!evoluError || !shown) return null;

  return (
    <View>
      <Text>{`Error: ${JSON.stringify(evoluError)}`}</Text>
      <Button title="Close" onPress={(): void => setShown(false)} />
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
