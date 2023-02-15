import { createHooks, model, NonEmptyString1000, SqliteBoolean } from "evolu";
import { ChangeEvent, FC, memo, useEffect, useState } from "react";

const Button: FC<{
  title: string;
  onClick: () => void;
}> = ({ title, onClick }): JSX.Element => {
  return (
    <button
      className="m-1 rounded-md border border-current px-1 text-sm"
      onClick={onClick}
    >
      {title}
    </button>
  );
};

// `model` is Evolu helper for branded types.
// https://dev.to/andersonjoseph/typescript-tip-safer-functions-with-branded-types-14o4

const TodoId = model.id<"todo">();
type TodoId = model.infer<typeof TodoId>;

const TodoCategoryId = model.id<"todoCategory">();
type TodoCategoryId = model.infer<typeof TodoCategoryId>;

const { useQuery, useMutation, useEvoluError, useOwner, useOwnerActions } =
  createHooks(
    {
      todo: {
        id: TodoId,
        title: model.NonEmptyString1000,
        isCompleted: model.SqliteBoolean,
        categoryId: TodoCategoryId,
      },
      todoCategory: {
        id: TodoCategoryId,
        name: model.NonEmptyString1000,
      },
    },
    {
      reloadUrl: "/examples/nextjs",
      ...(process.env.NODE_ENV === "development" && {
        syncUrl: "http://localhost:4000",
      }),
    }
  );

const promptNonEmptyString1000 = (
  message: string,
  callback: (value: NonEmptyString1000) => void
): void => {
  const value = prompt(message);
  if (value == null) return;
  const parsedValue = model.NonEmptyString1000.safeParse(value);
  if (!parsedValue.success) {
    alert(JSON.stringify(parsedValue.error, null, 2));
    return;
  }
  callback(parsedValue.data);
};

const TodoCategorySelect = ({
  selected,
  onSelect,
}: {
  selected: TodoCategoryId | null;
  onSelect: (value: TodoCategoryId | null) => void;
}): JSX.Element => {
  const { rows } = useQuery(
    (db) =>
      db
        .selectFrom("todoCategory")
        .select(["id", "name", "isDeleted"])
        .where("isDeleted", "is not", model.cast(true))
        .orderBy("createdAt"),
    // filterMap to filter rows with name == null
    ({ name, ...rest }) => name && { ...rest, name }
  );

  // That's what React recommends instead of null.
  const nothingSelected = "";

  const handleSelectChange = ({
    target: { value },
  }: ChangeEvent<HTMLSelectElement>): void => {
    onSelect(value === nothingSelected ? null : (value as TodoCategoryId));
  };

  // If a category has been deleted, show no category.
  const value =
    selected &&
    rows.find((r) => r.id === selected && r.isDeleted !== model.cast(true))
      ? selected
      : nothingSelected;

  return (
    <select value={value} onChange={handleSelectChange}>
      <option value={nothingSelected}>-- no category --</option>
      {rows.map(({ id, name }) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
};

const TodoItem = memo<{
  row: {
    id: TodoId;
    title: NonEmptyString1000;
    isCompleted: SqliteBoolean | null;
    categoryId: TodoCategoryId | null;
  };
}>(function TodoItem({ row: { id, title, isCompleted, categoryId } }) {
  const { mutate } = useMutation();

  const handleCompleteClick = (): void => {
    mutate("todo", { id, isCompleted: !isCompleted });
  };

  const handleRenameClick = (): void => {
    promptNonEmptyString1000("New Name", (title) =>
      mutate("todo", { id, title })
    );
  };

  const handleDeleteClick = (): void => {
    mutate("todo", { id, isDeleted: true });
  };

  const handleTodoCategorySelect = (
    categoryId: TodoCategoryId | null
  ): void => {
    mutate("todo", { id, categoryId });
  };

  return (
    <li key={id}>
      <span
        className="text-sm font-bold"
        style={{ textDecoration: isCompleted ? "line-through" : "none" }}
      >
        {title}
      </span>
      <Button
        title={isCompleted ? "completed" : "complete"}
        onClick={handleCompleteClick}
      />
      <Button title="Rename" onClick={handleRenameClick} />
      <Button title="Delete" onClick={handleDeleteClick} />
      <TodoCategorySelect
        selected={categoryId}
        onSelect={handleTodoCategorySelect}
      />
    </li>
  );
});

const TodoList = (): JSX.Element => {
  const { rows } = useQuery(
    (db) =>
      db
        .selectFrom("todo")
        .select(["id", "title", "isCompleted", "categoryId"])
        .where("isDeleted", "is not", model.cast(true))
        .orderBy("createdAt"),
    ({ title, ...rest }) => title && { title, ...rest }
  );

  const { mutate } = useMutation();

  const handleAddTodoClick = (): void => {
    promptNonEmptyString1000("What needs to be done?", (title) => {
      mutate("todo", { title });
    });
  };

  return (
    <>
      <h2 className="mt-6 text-xl font-semibold">Todos</h2>
      <ul className="py-2">
        {rows.map((row) => (
          <TodoItem key={row.id} row={row} />
        ))}
      </ul>
      <Button title="Add Todo" onClick={handleAddTodoClick} />
    </>
  );
};

const TodoCategoryList = (): JSX.Element => {
  const { rows } = useQuery(
    (db) =>
      db
        .selectFrom("todoCategory")
        .select(["id", "name"])
        .where("isDeleted", "is not", model.cast(true))
        .orderBy("createdAt"),
    ({ name, ...rest }) => name && { name, ...rest }
  );

  const { mutate } = useMutation();

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
                promptNonEmptyString1000("Category Name", (name) =>
                  mutate("todoCategory", { id, name })
                );
              }}
            />
            <Button
              title="Delete"
              onClick={(): void => {
                mutate("todoCategory", { id, isDeleted: true });
              }}
            />
          </li>
        ))}
      </ul>
      <Button
        title="Add Category"
        onClick={(): void => {
          promptNonEmptyString1000("Category Name", (name) =>
            mutate("todoCategory", { name })
          );
        }}
      />
    </>
  );
};

const OwnerActions = (): JSX.Element => {
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
          promptNonEmptyString1000("Your Mnemonic", (mnemonic) => {
            ownerActions
              .restore(mnemonic)()
              .then((either) => {
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

const NotificationBar = (): JSX.Element => {
  const evoluError = useEvoluError();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (evoluError) setShown(true);
  }, [evoluError]);

  if (!evoluError || !shown) return <></>;

  return (
    <div>
      <p>{`Error: ${JSON.stringify(evoluError.error)}`}</p>
      <Button title="Close" onClick={(): void => setShown(false)} />
    </div>
  );
};

export const NextJsExample = (): JSX.Element => {
  return (
    <>
      <NotificationBar />
      <TodoList />
      <TodoCategoryList />
      <OwnerActions />
    </>
  );
};
