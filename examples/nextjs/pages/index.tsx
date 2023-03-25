import {
  NonEmptyString50,
  TodoCategoryId,
  TodoTable,
  useEvoluError,
  useMutation,
  useOwner,
  useOwnerActions,
  useQuery,
} from "@/lib/db";
import * as S from "@effect/schema/Schema";
import { formatErrors } from "@effect/schema/TreeFormatter";
import * as E from "evolu";
import { ChangeEvent, FC, memo, useEffect, useState } from "react";

const prompt = <T extends string>(
  schema: S.Schema<T>,
  message: string,
  onSuccess: (value: T) => void
): void => {
  const value = window.prompt(message);
  if (value == null) return; // on cancel
  const a = S.decode(schema)(value);
  if (S.isFailure(a)) {
    alert(formatErrors(a.left));
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
      className="m-1 rounded-md border border-current px-1 text-sm"
      onClick={onClick}
    >
      {title}
    </button>
  );
};

const TodoCategorySelect: FC<{
  selected: TodoCategoryId | null;
  onSelect: (value: TodoCategoryId | null) => void;
}> = ({ selected, onSelect }) => {
  const { rows } = useQuery(
    (db) =>
      db
        .selectFrom("todoCategory")
        .select(["id", "name"])
        .where("isDeleted", "is not", E.cast(true))
        .orderBy("createdAt"),
    // (row) => row
    ({ name, ...rest }) => name && { name, ...rest }
  );

  const nothingSelected = "";
  const value =
    selected && rows.find((row) => row.id === selected)
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
      {rows.map(({ id, name }) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
};

const TodoItem = memo<{
  row: Pick<TodoTable, "id" | "title" | "isCompleted" | "categoryId">;
}>(function TodoItem({ row: { id, title, isCompleted, categoryId } }) {
  const { update } = useMutation();

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
        onClick={(): void => {
          update("todo", { id, isCompleted: !isCompleted });
        }}
      />
      <Button
        title="Rename"
        onClick={(): void => {
          prompt(E.NonEmptyString1000, "New Name", (title) => {
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
        selected={categoryId}
        onSelect={(categoryId): void => {
          update("todo", { id, categoryId });
        }}
      />
    </li>
  );
});

const TodoList: FC = () => {
  const { rows } = useQuery(
    (db) =>
      db
        .selectFrom("todo")
        .select(["id", "title", "isCompleted", "categoryId"])
        .where("isDeleted", "is not", E.cast(true))
        .orderBy("createdAt"),
    // (row) => row
    ({ title, isCompleted, ...rest }) =>
      title && isCompleted != null && { title, isCompleted, ...rest }
  );

  return (
    <>
      <h2 className="mt-6 text-xl font-semibold">Todos</h2>
      <ul className="py-2">
        {rows.map((row) => (
          <TodoItem key={row.id} row={row} />
        ))}
      </ul>
    </>
  );
};

const AddTodo: FC = () => {
  const { create } = useMutation();

  return (
    <Button
      title="Add Todo"
      onClick={(): void => {
        prompt(E.NonEmptyString1000, "What needs to be done?", (title) => {
          create("todo", { title, isCompleted: false });
        });
      }}
    />
  );
};

const TodoCategoryList: FC = () => {
  const { rows } = useQuery(
    (db) =>
      db
        .selectFrom("todoCategory")
        .select(["id", "name"])
        .where("isDeleted", "is not", E.cast(true))
        .orderBy("createdAt"),
    // (row) => row
    ({ name, ...rest }) => name && { name, ...rest }
  );

  const { update } = useMutation();

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
    </>
  );
};

const AddTodoCategory: FC = () => {
  const { create } = useMutation();

  return (
    <Button
      title="Add Category"
      onClick={(): void => {
        prompt(NonEmptyString50, "Category Name", (name) => {
          create("todoCategory", { name });
        });
      }}
    />
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
          prompt(E.NonEmptyString1000, "Your Mnemonic", (mnemonic) => {
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
      <p>{`Error: ${JSON.stringify(evoluError.error)}`}</p>
      <Button title="Close" onClick={(): void => setShown(false)} />
    </div>
  );
};

export default function Index(): JSX.Element {
  return (
    <div>
      <h1>Evolu Next.js</h1>
      <NotificationBar />
      <TodoList />
      <AddTodo />
      <TodoCategoryList />
      <AddTodoCategory />
      <OwnerActions />
      <p>
        <a href="https://twitter.com/evoluhq">twitter</a>{" "}
        <a href="https://github.com/evoluhq/evolu">github</a>
      </p>
    </div>
  );
}
