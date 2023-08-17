import { pipe } from "@effect/data/Function";
import SelectDropdown from "react-native-select-dropdown";
import * as Schema from "@effect/schema/Schema";
import * as Evolu from "evolu";
import { StatusBar } from "expo-status-bar";
import {
  FC,
  Suspense,
  memo,
  startTransition,
  useEffect,
  useState,
} from "react";
import { Button, StyleSheet, Text, View } from "react-native";

const TodoId = Evolu.id("Todo");
type TodoId = Schema.To<typeof TodoId>;

const TodoCategoryId = Evolu.id("TodoCategory");
type TodoCategoryId = Schema.To<typeof TodoCategoryId>;

const NonEmptyString50 = pipe(
  Schema.string,
  Schema.minLength(1),
  Schema.maxLength(50),
  Schema.brand("NonEmptyString50"),
);
type NonEmptyString50 = Schema.To<typeof NonEmptyString50>;

const TodoTable = Schema.struct({
  id: TodoId,
  title: Evolu.NonEmptyString1000,
  isCompleted: Evolu.SqliteBoolean,
  categoryId: Schema.nullable(TodoCategoryId),
});
type TodoTable = Schema.To<typeof TodoTable>;

const TodoCategoryTable = Schema.struct({
  id: TodoCategoryId,
  name: NonEmptyString50,
});
type TodoCategoryTable = Schema.To<typeof TodoCategoryTable>;

const Database = Schema.struct({
  todo: TodoTable,
  todoCategory: TodoCategoryTable,
});

const { useQuery, useMutation, useEvoluError, useOwner, useOwnerActions } =
  Evolu.create(Database);

const prompt = <From extends string, To>(
  _schema: Schema.Schema<From, To>,
  _message: string,
  _onSuccess: (value: To) => void,
): void => {
  // // Alert.prompt()
  // const value = window.prompt(message);
  // if (value == null) return; // on cancel
  // const a = Schema.parseEither(schema)(value);
  // if (a._tag === "Left") {
  //   alert(formatErrors(a.left.errors));
  //   return;
  // }
  // onSuccess(a.right);
};

type TodoCategoriesList = ReadonlyArray<{
  id: TodoCategoryId;
  name: NonEmptyString50;
}>;

const useTodoCategoriesList = (): TodoCategoriesList =>
  useQuery(
    (db) =>
      db
        .selectFrom("todoCategory")
        .select(["id", "name"])
        .where("isDeleted", "is not", Evolu.cast(true))
        .orderBy("createdAt"),
    // Filter out rows with nullable names.
    ({ name, ...rest }) => name && { name, ...rest },
  ).rows;

const TodoCategorySelect: FC<{
  selected: TodoCategoryId | null;
  onSelect: (_value: TodoCategoryId | null) => void;
  todoCategoriesList: TodoCategoriesList;
}> = ({ selected, onSelect, todoCategoriesList }) => {
  const nothingSelected = "";
  const value =
    selected && todoCategoriesList.find((row) => row.id === selected)
      ? selected
      : nothingSelected;

  //   {/* <option value={nothingSelected}>-- no category --</option>
  //   {todoCategoriesList.map(({ id, name }) => (
  //     <option key={id} value={id}>
  //       {name}
  //     </option>
  //   ))}
  // </SelectDropdown> */}
  return (
    <SelectDropdown
      data={todoCategoriesList.map((i) => i.name)}
      onSelect={(): void => {
        // eslint-disable-next-line no-console
        console.log(value, onSelect);
      }}
      // value={value}
      // onChange={({
      //   target: { value },
      // }: ChangeEvent<HTMLSelectElement>): void => {
      //   onSelect(value === nothingSelected ? null : (value as TodoCategoryId));
      // }}
    />
  );
};

const TodoItem = memo<{
  row: Pick<TodoTable, "id" | "title" | "isCompleted" | "categoryId">;
  todoCategoriesList: TodoCategoriesList;
}>(function TodoItem({
  row: { id, title, isCompleted, categoryId },
  todoCategoriesList,
}) {
  const { update } = useMutation();

  return (
    <View>
      <span
        className="text-sm font-bold"
        style={{ textDecoration: isCompleted ? "line-through" : "none" }}
      >
        {title}
      </span>
      <Button
        title={isCompleted ? "completed" : "complete"}
        onPress={(): void => {
          update("todo", { id, isCompleted: !isCompleted });
        }}
      />
      <Button
        title="Rename"
        onPress={(): void => {
          prompt(Evolu.NonEmptyString1000, "New Name", (title) => {
            update("todo", { id, title });
          });
        }}
      />
      <Button
        title="Delete"
        onPress={(): void => {
          update("todo", { id, isDeleted: true });
        }}
      />
      <TodoCategorySelect
        todoCategoriesList={todoCategoriesList}
        selected={categoryId}
        onSelect={(categoryId): void => {
          update("todo", { id, categoryId });
        }}
      />
    </View>
  );
});

const Todos: FC = () => {
  const { create } = useMutation();
  const { rows } = useQuery(
    (db) =>
      db
        .selectFrom("todo")
        .select(["id", "title", "isCompleted", "categoryId"])
        .where("isDeleted", "is not", Evolu.cast(true))
        .orderBy("createdAt"),
    // (row) => row
    ({ title, isCompleted, ...rest }) =>
      title && isCompleted != null && { title, isCompleted, ...rest },
  );
  const todoCategoriesList = useTodoCategoriesList();

  return (
    <>
      <Text>Todos</Text>
      <View>
        {rows.map((row) => (
          <TodoItem
            key={row.id}
            row={row}
            todoCategoriesList={todoCategoriesList}
          />
        ))}
      </View>
      <Button
        title="Add Todo"
        onPress={(): void => {
          prompt(
            Evolu.NonEmptyString1000,
            "What needs to be done?",
            (title) => {
              create("todo", { title, isCompleted: false });
            },
          );
        }}
      />
    </>
  );
};

const TodoCategories: FC = () => {
  const { create, update } = useMutation();
  const { rows } = useQuery(
    (db) =>
      db
        .selectFrom("todoCategory")
        .select(["id", "name"])
        .where("isDeleted", "is not", Evolu.cast(true))
        .orderBy("createdAt"),
    // (row) => row
    ({ name, ...rest }) => name && { name, ...rest },
  );

  return null;

  return (
    <>
      <h2 className="mt-6 text-xl font-semibold">Categories</h2>
      <ul className="py-2">
        {rows.map(({ id, name }) => (
          <li key={id}>
            <span className="text-sm font-bold">{name}</span>
            <Button
              title="Rename"
              onPress={(): void => {
                prompt(NonEmptyString50, "Category Name", (name) => {
                  update("todoCategory", { id, name });
                });
              }}
            />
            <Button
              title="Delete"
              onPress={(): void => {
                update("todoCategory", { id, isDeleted: true });
              }}
            />
          </li>
        ))}
      </ul>
      <Button
        title="Add Category"
        onPress={(): void => {
          prompt(NonEmptyString50, "Category Name", (name) => {
            create("todoCategory", { name });
          });
        }}
      />
    </>
  );
};

const OwnerActions: FC = () => {
  const [isShown, setIsShown] = useState(false);
  const owner = useOwner();
  const ownerActions = useOwnerActions();

  return (
    <View>
      <Text>
        Open this page on a different device and use your mnemonic to restore
        your data.
      </Text>
      <Button
        title={`${!isShown ? "Show" : "Hide"} Mnemonic`}
        onPress={(): void => setIsShown((value) => !value)}
      />
      <Button
        title="Restore Owner"
        onPress={(): void => {
          prompt(Evolu.NonEmptyString1000, "Your Mnemonic", (mnemonic) => {
            void ownerActions.restore(mnemonic).then((either) => {
              if (either._tag === "Left")
                alert(JSON.stringify(either.left, null, 2));
            });
          });
        }}
      />
      <Button
        title="Reset Owner"
        onPress={(): void => {
          if (confirm("Are you sure? It will delete all your local data."))
            ownerActions.reset();
        }}
      />
      {isShown && owner != null && (
        <View>
          <textarea
            value={owner.mnemonic}
            readOnly
            rows={2}
            style={{ width: 320 }}
          />
        </View>
      )}
    </View>
  );
};

const NotificationBar: FC = () => {
  const evoluError = useEvoluError();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (evoluError) setShown(true);
  }, [evoluError]);

  if (!evoluError || !shown) return <></>;

  return (
    <View>
      <Text>{`Error: ${JSON.stringify(evoluError)}`}</Text>
      <Button title="Close" onPress={(): void => setShown(false)} />
    </View>
  );
};

const NextJsExample: FC = () => {
  const [todosShown, setTodosShown] = useState(true);

  return (
    <Suspense>
      <NotificationBar />
      <View>
        <Button
          title="Simulate suspense-enabled router transition"
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
      {todosShown ? <Todos /> : <TodoCategories />}
      <OwnerActions />
    </Suspense>
  );
};

export default function App(): JSX.Element {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <NextJsExample />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
