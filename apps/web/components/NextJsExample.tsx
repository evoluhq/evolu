import { TreeFormatter } from "@effect/schema";
import * as S from "@effect/schema/Schema";
import * as Evolu from "@evolu/react";
import { Effect, Exit } from "effect";
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Database = S.struct({
  todo: TodoTable,
  todoCategory: TodoCategoryTable,
});
type Database = S.Schema.To<typeof Database>;

const {
  useEvoluError,
  createQuery,
  useQuery,
  useCreate,
  useUpdate,
  useOwner,
  useEvolu,
} = Evolu.create(Database, {
  reloadUrl: "/examples/nextjs",
  ...(process.env.NODE_ENV === "development" && {
    syncUrl: "http://localhost:4000",
  }),
});

export const NextJsExample = memo(function NextJsExample() {
  const [todosShown, setTodosShown] = useState(true);

  // https://react.dev/reference/react/useTransition#building-a-suspense-enabled-router
  const handleTabClick = (): void =>
    startTransition(() => {
      setTodosShown(!todosShown);
    });

  return (
    <>
      <OwnerActions />
      <nav className="my-4">
        <Button
          title="Simulate suspense-enabled router transition"
          onClick={handleTabClick}
        />
        <p>
          Using suspense-enabled router transition, you will not see any loader
          or jumping content.
        </p>
      </nav>
      <Suspense>{todosShown ? <Todos /> : <TodoCategories />}</Suspense>
      <NotificationBar />
    </>
  );
});

const OwnerActions: FC = () => {
  const evolu = useEvolu();
  const owner = useOwner();
  const [isShown, setIsShown] = useState(false);

  const handleRestoreOwnerClick = (): void => {
    prompt(Evolu.NonEmptyString1000, "Your Mnemonic", (mnemonic) => {
      evolu
        .parseMnemonic(mnemonic)
        .pipe(Effect.runPromiseExit)
        .then(
          Exit.match({
            onFailure: (error) => {
              alert(JSON.stringify(error, null, 2));
            },
            onSuccess: evolu.restoreOwner,
          }),
        );
    });
  };

  const handleResetOwnerClick = (): void => {
    if (confirm("Are you sure? It will delete all your local data."))
      evolu.resetOwner();
  };

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
      <Button title="Restore Owner" onClick={handleRestoreOwnerClick} />
      <Button title="Reset Owner" onClick={handleResetOwnerClick} />
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

const todosWithCategories = createQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted", "categoryId"])
    .where("isDeleted", "is not", Evolu.cast(true))
    .where("title", "is not", null)
    .where("isCompleted", "is not", null)
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
    ])
    .$narrowType<{ title: Evolu.NonEmptyString1000 }>()
    .$narrowType<{ isCompleted: Evolu.SqliteBoolean }>(),
);

const Todos: FC = () => {
  const create = useCreate();
  const { rows } = useQuery(todosWithCategories);

  const handleAddTodoClick = (): void => {
    prompt(Evolu.NonEmptyString1000, "What needs to be done?", (title) => {
      create("todo", { title, isCompleted: false });
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

const TodoItem = memo<{
  row: Pick<TodoTable, "id" | "title" | "isCompleted" | "categoryId"> & {
    categories: ReadonlyArray<TodoCategoryForSelect>;
  };
}>(function TodoItem({
  row: { id, title, isCompleted, categoryId, categories },
}) {
  const update = useUpdate();

  const handleToggleCompletedClick = (): void => {
    update("todo", { id, isCompleted: !isCompleted });
  };

  const handleRenameClick = (): void => {
    prompt(Evolu.NonEmptyString1000, "New Name", (title) => {
      update("todo", { id, title });
    });
  };

  const handleDeleteClick = (): void => {
    update("todo", { id, isDeleted: true });
  };

  return (
    <li>
      <span
        className="text-sm font-bold"
        style={{ textDecoration: isCompleted ? "line-through" : "none" }}
      >
        {title}
      </span>
      <Button
        title={isCompleted ? "Completed" : "Complete"}
        onClick={handleToggleCompletedClick}
      />
      <Button title="Rename" onClick={handleRenameClick} />
      <Button title="Delete" onClick={handleDeleteClick} />
      <TodoCategorySelect
        categories={categories}
        selected={categoryId}
        onSelect={(categoryId): void => {
          update("todo", { id, categoryId });
        }}
      />
    </li>
  );
});

interface TodoCategoryForSelect {
  readonly id: TodoCategoryTable["id"];
  readonly name: TodoCategoryTable["name"] | null;
}

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
    <select
      value={value}
      onChange={({
        target: { value },
      }: ChangeEvent<HTMLSelectElement>): void => {
        onSelect(value === nothingSelected ? null : (value as TodoCategoryId));
      }}
    >
      <option value={nothingSelected}>-- no category --</option>
      {categories.map(({ id, name }) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
};

const todoCategories = createQuery((db) =>
  db
    .selectFrom("todoCategory")
    .select(["id", "name", "json"])
    .where("isDeleted", "is not", Evolu.cast(true))
    .where("name", "is not", null)
    .orderBy("createdAt")
    .$narrowType<{ name: NonEmptyString50 }>(),
);

const TodoCategories: FC = () => {
  const create = useCreate();
  const { rows } = useQuery(todoCategories);

  // Evolu automatically parses JSONs into typed objects.
  // if (rows[0]) console.log(rows[0].json?.foo);

  const handleAddCategoryClick = (): void => {
    prompt(NonEmptyString50, "Category Name", (name) => {
      create("todoCategory", {
        name,
        json: { foo: "a", bar: false },
      });
    });
  };

  return (
    <>
      <h2 className="mt-6 text-xl font-semibold">Categories</h2>
      <ul className="py-2">
        {rows.map((row) => (
          <TodoCategoryItem row={row} key={row.id} />
        ))}
      </ul>
      <Button title="Add Category" onClick={handleAddCategoryClick} />
    </>
  );
};

const TodoCategoryItem = memo<{
  row: Pick<TodoCategoryTable, "id" | "name">;
}>(function TodoItem({ row: { id, name } }) {
  const update = useUpdate();

  const handleRenameClick = (): void => {
    prompt(NonEmptyString50, "Category Name", (name) => {
      update("todoCategory", { id, name });
    });
  };

  const handleDeleteClick = (): void => {
    update("todoCategory", { id, isDeleted: true });
  };

  return (
    <>
      <li key={id}>
        <span className="text-sm font-bold">{name}</span>
        <Button title="Rename" onClick={handleRenameClick} />
        <Button title="Delete" onClick={handleDeleteClick} />
      </li>
    </>
  );
});

const NotificationBar: FC = () => {
  const evoluError = useEvoluError();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (evoluError) setShown(true);
  }, [evoluError]);

  if (!evoluError || !shown) return null;

  return (
    <div>
      <p>{`Error: ${JSON.stringify(evoluError)}`}</p>
      <Button title="Close" onClick={(): void => setShown(false)} />
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const prompt = <From extends string, To>(
  schema: S.Schema<From, To>,
  message: string,
  onSuccess: (value: To) => void,
): void => {
  const value = window.prompt(message);
  if (value == null) return; // on cancel
  const a = S.parseEither(schema)(value);
  if (a._tag === "Left") {
    alert(TreeFormatter.formatErrors(a.left.errors));
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
