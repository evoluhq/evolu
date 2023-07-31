import { pipe } from "@effect/data/Function";
import * as Schema from "@effect/schema/Schema";
import { formatErrors } from "@effect/schema/TreeFormatter";
import * as Evolu from "evolu";
import {
  ChangeEvent,
  FC,
  Suspense,
  memo,
  startTransition,
  useEffect,
  useState,
} from "react";

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
type Database = Schema.To<typeof Database>;

const { useQuery, useMutation, useEvoluError, useOwner, useOwnerActions } =
  Evolu.create<Database>({
    reloadUrl: "/examples/nextjs",
    ...(process.env.NODE_ENV === "development" && {
      syncUrl: "http://localhost:4000",
    }),
  });

const prompt = <From extends string, To>(
  schema: Schema.Schema<From, To>,
  message: string,
  onSuccess: (value: To) => void,
): void => {
  const value = window.prompt(message);
  if (value == null) return; // on cancel
  const a = Schema.parseEither(schema)(value);
  if (a._tag === "Left") {
    alert(formatErrors(a.left.errors));
    return;
  }
  onSuccess(a.right);
};

const Button: FC<{
  title: string;
  onClick: () => void;
}> = ({ title, onClick }) => {
  return (
    <button
      className="m-1 rounded-md border border-current px-1 text-sm active:opacity-80"
      onClick={onClick}
    >
      {title}
    </button>
  );
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

  return (
    <select
      value={value}
      onChange={({
        target: { value },
      }: ChangeEvent<HTMLSelectElement>): void => {
        onSelect(value === nothingSelected ? null : (value as TodoCategoryId));
      }}
    >
      <option value={nothingSelected}>-- no category --</option>
      {todoCategoriesList.map(({ id, name }) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
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
    <li>
      <span
        className="text-sm font-bold"
        style={{ textDecoration: isCompleted ? "line-through" : "none" }}
      >
        {title}
      </span>
      <Button
        title={isCompleted ? "completed" : "complete"}
        onClick={(): void => {
          update("todo", { id, isCompleted: !isCompleted });
        }}
      />
      <Button
        title="Rename"
        onClick={(): void => {
          prompt(Evolu.NonEmptyString1000, "New Name", (title) => {
            update("todo", { id, title });
          });
        }}
      />
      <Button
        title="Delete"
        onClick={(): void => {
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
    </li>
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
      <h2 className="mt-6 text-xl font-semibold">Todos</h2>
      <ul className="py-2">
        {rows.map((row) => (
          <TodoItem
            key={row.id}
            row={row}
            todoCategoriesList={todoCategoriesList}
          />
        ))}
      </ul>
      <Button
        title="Add Todo"
        onClick={(): void => {
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

  return (
    <>
      <h2 className="mt-6 text-xl font-semibold">Categories</h2>
      <ul className="py-2">
        {rows.map(({ id, name }) => (
          <li key={id}>
            <span className="text-sm font-bold">{name}</span>
            <Button
              title="Rename"
              onClick={(): void => {
                prompt(NonEmptyString50, "Category Name", (name) => {
                  update("todoCategory", { id, name });
                });
              }}
            />
            <Button
              title="Delete"
              onClick={(): void => {
                update("todoCategory", { id, isDeleted: true });
              }}
            />
          </li>
        ))}
      </ul>
      <Button
        title="Add Category"
        onClick={(): void => {
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
    <div className="mt-6">
      <p>
        Open this page on a different device and use your mnemonic to restore
        your data.
      </p>
      <Button
        title={`${!isShown ? "Show" : "Hide"} Mnemonic`}
        onClick={(): void => setIsShown((value) => !value)}
      />
      <Button
        title="Restore Owner"
        onClick={(): void => {
          prompt(Evolu.NonEmptyString1000, "Your Mnemonic", (mnemonic) => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            ownerActions.restore(mnemonic).then((either) => {
              if (either._tag === "Left")
                alert(JSON.stringify(either.left, null, 2));
            });
          });
        }}
      />
      <Button
        title="Reset Owner"
        onClick={(): void => {
          if (confirm("Are you sure? It will delete all your local data."))
            ownerActions.reset();
        }}
      />
      {isShown && owner != null && (
        <div>
          <textarea
            value={owner.mnemonic}
            readOnly
            rows={2}
            style={{ width: 320 }}
          />
        </div>
      )}
    </div>
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
    <div>
      <p>{`Error: ${JSON.stringify(evoluError)}`}</p>
      <Button title="Close" onClick={(): void => setShown(false)} />
    </div>
  );
};

export const NextJsExample: FC = () => {
  const [todosShown, setTodosShown] = useState(true);

  return (
    <>
      <NotificationBar />
      <Suspense>
        <nav className="my-4">
          <Button
            title="Simulate suspense-enabled router transition"
            onClick={(): void => {
              // https://react.dev/reference/react/useTransition#building-a-suspense-enabled-router
              startTransition(() => {
                setTodosShown(!todosShown);
              });
            }}
          />
          <p>
            Using suspense-enabled router transition, you will not see any
            loader or jumping content.
          </p>
        </nav>
        {todosShown ? <Todos /> : <TodoCategories />}
        <OwnerActions />
      </Suspense>
    </>
  );
};
