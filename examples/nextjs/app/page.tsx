"use client";

import * as Schema from "@effect/schema/Schema";
import { formatErrors } from "@effect/schema/TreeFormatter";
import * as Evolu from "evolu";
import { ChangeEvent, FC, memo, useEffect, useState } from "react";
import {
  NonEmptyString50,
  TodoCategoryId,
  TodoTable,
  useEvoluError,
  useMutation,
  useOwner,
  useOwnerActions,
  useQuery,
} from "../lib/db";

const prompt = <From extends string, To>(
  schema: Schema.Schema<From, To>,
  message: string,
  onSuccess: (value: To) => void
) => {
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
        .where("isDeleted", "is not", Evolu.cast(true))
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
      onChange={({ target: { value } }: ChangeEvent<HTMLSelectElement>) => {
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
        onClick={() => {
          update("todo", { id, isCompleted: !isCompleted });
        }}
      />
      <Button
        title="Rename"
        onClick={() => {
          prompt(Evolu.NonEmptyString1000, "New Name", (title) => {
            update("todo", { id, title });
          });
        }}
      />
      <Button
        title="Delete"
        onClick={() => {
          update("todo", { id, isDeleted: true });
        }}
      />
      <TodoCategorySelect
        selected={categoryId}
        onSelect={(categoryId) => {
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
        .where("isDeleted", "is not", Evolu.cast(true))
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
      onClick={() => {
        prompt(Evolu.NonEmptyString1000, "What needs to be done?", (title) => {
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
        .where("isDeleted", "is not", Evolu.cast(true))
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
              onClick={() => {
                prompt(NonEmptyString50, "Category Name", (name) => {
                  update("todoCategory", { id, name });
                });
              }}
            />
            <Button
              title="Delete"
              onClick={() => {
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
      onClick={() => {
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
        onClick={() => setIsShown((value) => !value)}
      />
      <Button
        title="Restore Owner"
        onClick={() => {
          prompt(Evolu.NonEmptyString1000, "Your Mnemonic", (mnemonic) => {
            ownerActions.restore(mnemonic).then((either) => {
              if (either._tag === "Left")
                alert(JSON.stringify(either.left, null, 2));
            });
          });
        }}
      />
      <Button
        title="Reset Owner"
        onClick={() => {
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
      <Button title="Close" onClick={() => setShown(false)} />
    </div>
  );
};

export default function Page() {
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