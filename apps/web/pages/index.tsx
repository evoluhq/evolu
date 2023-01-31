/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  config,
  createHooks,
  getError,
  getOwner,
  model,
  NonEmptyString1000,
  resetOwner,
  restoreOwner,
  SqliteBoolean,
  subscribeError,
  useEvoluFirstDataAreLoaded,
} from "evolu";
import Head from "next/head";
import { ChangeEvent, memo, useEffect, useState } from "react";

config.syncUrl = "http://localhost:4000";

// `model` is Evolu helper for branded types.
// https://dev.to/andersonjoseph/typescript-tip-safer-functions-with-branded-types-14o4

const TodoId = model.id<"todo">();
type TodoId = model.infer<typeof TodoId>;

const TodoCategoryId = model.id<"todoCategory">();
type TodoCategoryId = model.infer<typeof TodoCategoryId>;

const { useQuery, useMutation } = createHooks({
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
});

const promptNonEmptyString1000 = (
  message: string,
  callback: (value: NonEmptyString1000) => void
) => {
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
}) => {
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
  }: ChangeEvent<HTMLSelectElement>) => {
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

  const handleCompleteClick = () => {
    mutate("todo", { id, isCompleted: !isCompleted });
  };

  const handleRenameClick = () => {
    promptNonEmptyString1000("New Name", (title) =>
      mutate("todo", { id, title })
    );
  };

  const handleDeleteClick = () => {
    mutate("todo", { id, isDeleted: true });
  };

  const handleTodoCategorySelect = (categoryId: TodoCategoryId | null) => {
    mutate("todo", { id, categoryId });
  };

  return (
    <li key={id}>
      <p>
        <span style={{ textDecoration: isCompleted ? "line-through" : "none" }}>
          {title}
        </span>{" "}
        <button onClick={handleCompleteClick}>
          {isCompleted ? "completed" : "complete"}
        </button>
        <button onClick={handleRenameClick}>rename</button>
        <button onClick={handleDeleteClick}>delete</button>
        <TodoCategorySelect
          selected={categoryId}
          onSelect={handleTodoCategorySelect}
        />
      </p>
    </li>
  );
});

const TodoList = () => {
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

  const handleAddTodoClick = () => {
    promptNonEmptyString1000("What needs to be done?", (title) => {
      mutate("todo", { title });
    });
  };

  return (
    <>
      <h2>todos</h2>
      <ul>
        {rows.map((row) => (
          <TodoItem key={row.id} row={row} />
        ))}
      </ul>
      <button onClick={handleAddTodoClick}>Add Todo</button>
    </>
  );
};

const TodoCategoryList = () => {
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
      <h2>categories</h2>
      <ul>
        {rows.map(({ id, name }) => (
          <li key={id}>
            {name}{" "}
            <button
              onClick={() => mutate("todoCategory", { id, isDeleted: true })}
            >
              delete
            </button>
            <button
              onClick={() => {
                promptNonEmptyString1000("Category Name", (name) =>
                  mutate("todoCategory", { id, name })
                );
              }}
            >
              rename
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={() => {
          promptNonEmptyString1000("Category Name", (name) =>
            mutate("todoCategory", { name })
          );
        }}
      >
        Add Category
      </button>
    </>
  );
};

const OwnerActions = () => {
  const [mnemonic, setMnemonic] = useState<string | null>(null);

  return (
    <>
      <p>Mnemonic is your password generated by Evolu.</p>
      <p>
        Open this page on a different device and use your mnemonic to restore
        your data.
      </p>
      <button
        onClick={() => {
          getOwner().then((owner) => {
            setMnemonic(mnemonic == null ? owner.mnemonic : null);
          });
        }}
      >
        {mnemonic == null ? "Show" : "Hide"} Mnemonic
      </button>
      <button
        onClick={() => {
          promptNonEmptyString1000("Your Mnemonic", (mnemonic) => {
            const either = restoreOwner(mnemonic);
            if (either._tag === "Left")
              alert(JSON.stringify(either.left, null, 2));
          });
        }}
      >
        Restore Owner
      </button>
      <button
        onClick={() => {
          if (confirm("Are you sure? It will delete all your local data."))
            resetOwner();
        }}
      >
        Reset Owner
      </button>
      {mnemonic != null && (
        <div>
          <textarea value={mnemonic} readOnly rows={2} style={{ width: 320 }} />
        </div>
      )}
    </>
  );
};

const NotificationBar = () => {
  const [notificationMessage, setNotificationMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    const notifyOnError = () => {
      const error = getError();
      if (error) {
        setNotificationMessage(`Error: ${JSON.stringify(error.error)}`);
      }
    };
    return subscribeError(notifyOnError);
  }, []);

  if (!notificationMessage) return null;

  return (
    <div>
      <p>{notificationMessage}</p>
      <button onClick={() => setNotificationMessage(null)}>close</button>
    </div>
  );
};

export default function Index() {
  const dataAreLoaded = useEvoluFirstDataAreLoaded();

  return (
    <div>
      <Head>
        <title>Evolu TodoMVC</title>
      </Head>
      <h1>Evolu TodoMVC</h1>
      <NotificationBar />
      <div hidden={!dataAreLoaded}>
        <TodoList />
        <TodoCategoryList />
        <OwnerActions />
        <p>
          <a href="https://twitter.com/evoluhq">twitter</a>{" "}
          <a href="https://github.com/evoluhq/evolu">github</a>
        </p>
      </div>
    </div>
  );
}
