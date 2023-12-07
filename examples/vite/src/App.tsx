import { TreeFormatter } from "@effect/schema";
import * as S from "@effect/schema/Schema";
import {
  EvoluProvider,
  NonEmptyString1000,
  SqliteBoolean,
  String,
  canUseDom,
  cast,
  createEvolu,
  id,
  jsonArrayFrom,
  parseMnemonic,
  useEvolu,
  useEvoluError,
  useOwner,
  useQuery,
} from "@evolu/react";
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

const TodoId = id("Todo");
type TodoId = S.Schema.To<typeof TodoId>;

const TodoCategoryId = id("TodoCategory");
type TodoCategoryId = S.Schema.To<typeof TodoCategoryId>;

const NonEmptyString50 = String.pipe(
  S.minLength(1),
  S.maxLength(50),
  S.brand("NonEmptyString50")
);
type NonEmptyString50 = S.Schema.To<typeof NonEmptyString50>;

const TodoTable = S.struct({
  id: TodoId,
  title: NonEmptyString1000,
  isCompleted: S.nullable(SqliteBoolean),
  categoryId: S.nullable(TodoCategoryId),
});
type TodoTable = S.Schema.To<typeof TodoTable>;

const SomeJson = S.struct({ foo: S.string, bar: S.boolean });
type SomeJson = S.Schema.To<typeof SomeJson>;

const TodoCategoryTable = S.struct({
  id: TodoCategoryId,
  name: NonEmptyString50,
  json: S.nullable(SomeJson),
});
type TodoCategoryTable = S.Schema.To<typeof TodoCategoryTable>;

const Database = S.struct({
  todo: TodoTable,
  todoCategory: TodoCategoryTable,
});
type Database = S.Schema.To<typeof Database>;

const evolu = createEvolu(Database);

const createFixtures = (): Promise<void> =>
  Promise.all(
    evolu.loadQueries([
      evolu.createQuery((db) => db.selectFrom("todo").selectAll()),
      evolu.createQuery((db) => db.selectFrom("todoCategory").selectAll()),
    ])
  ).then(([todos, categories]) => {
    if (todos.row || categories.row) return;

    const { id: notUrgentCategoryId } = evolu.create("todoCategory", {
      name: S.parseSync(NonEmptyString50)("Not Urgent"),
    });

    evolu.create("todo", {
      title: S.parseSync(NonEmptyString1000)("Try React Suspense"),
      categoryId: notUrgentCategoryId,
    });
  });

const isRestoringOwner = (isRestoringOwner?: boolean): boolean => {
  if (!canUseDom) return false;
  const key = 'evolu:isRestoringOwner"';
  if (isRestoringOwner != null)
    localStorage.setItem(key, isRestoringOwner.toString());
  return localStorage.getItem(key) === "true";
};

// Ensure fixtures are not added to the restored owner.
if (!isRestoringOwner()) createFixtures();

const NextJsExample = memo(function NextJsExample() {
  const [currentTab, setCurrentTab] = useState<"todos" | "categories">("todos");

  const handleTabClick = (): void =>
    // https://react.dev/reference/react/useTransition#building-a-suspense-enabled-router
    startTransition(() => {
      setCurrentTab(currentTab === "todos" ? "categories" : "todos");
    });

  return (
    <EvoluProvider value={evolu}>
      <NotificationBar />
      <h2 className="mt-6 text-xl font-semibold">
        {currentTab === "todos" ? "Todos" : "Categories"}
      </h2>
      <Suspense>
        {currentTab === "todos" ? <Todos /> : <TodoCategories />}
        <Button title="Switch Tab" onClick={handleTabClick} />
        <p className="my-4">
          To try React Suspense, click the `Switch Tab` button and rename a
          category. Then click the `Switch Tab` again to see the updated
          category name without any loading state. React Suspense is excellent
          for UX.
        </p>
        <p className="my-4">
          The data created in this example are stored locally in SQLite. Evolu
          encrypts the data for backup and sync with a Mnemonic, a unique safe
          password created on your device.
        </p>
        <OwnerActions />
      </Suspense>
    </EvoluProvider>
  );
});

const NotificationBar: FC = () => {
  const evoluError = useEvoluError();
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (evoluError) setShowError(true);
  }, [evoluError]);

  return (
    <div className="mt-3">
      {evoluError && !showError && (
        <>
          <p>{`Error: ${JSON.stringify(evoluError)}`}</p>
          <Button title="Close" onClick={(): void => setShowError(false)} />
        </>
      )}
    </div>
  );
};

const todosWithCategories = evolu.createQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted", "categoryId"])
    .where("isDeleted", "is not", cast(true))
    // Filter null value and ensure non-null type. Evolu will provide a helper.
    .where("title", "is not", null)
    .$narrowType<{ title: NonEmptyString1000 }>()
    .orderBy("createdAt")
    // https://kysely.dev/docs/recipes/relations
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("todoCategory")
          .select(["todoCategory.id", "todoCategory.name"])
          .where("isDeleted", "is not", cast(true))
          .orderBy("createdAt")
      ).as("categories"),
    ])
);

const Todos: FC = () => {
  const { rows } = useQuery(todosWithCategories);
  const { create } = useEvolu<Database>();

  const handleAddTodoClick = (): void => {
    prompt(NonEmptyString1000, "What needs to be done?", (title) => {
      create("todo", { title });
    });
  };

  return (
    <>
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
  const { update } = useEvolu<Database>();

  const handleToggleCompletedClick = (): void => {
    update("todo", { id, isCompleted: !isCompleted });
  };

  const handleRenameClick = (): void => {
    prompt(NonEmptyString1000, "New Name", (title) => {
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

const todoCategories = evolu.createQuery((db) =>
  db
    .selectFrom("todoCategory")
    .select(["id", "name", "json"])
    .where("isDeleted", "is not", cast(true))
    // Filter null value and ensure non-null type. Evolu will provide a helper.
    .where("name", "is not", null)
    .$narrowType<{ name: NonEmptyString50 }>()
    .orderBy("createdAt")
);

const TodoCategories: FC = () => {
  const { create } = useEvolu();
  const { rows } = useQuery(todoCategories);

  // Evolu automatically parses JSONs into typed objects.
  // if (rows[0]) console.log(rows[1].json?.foo);

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
  const { update } = useEvolu<Database>();

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

const OwnerActions: FC = () => {
  const evolu = useEvolu();
  const owner = useOwner();
  const [showMnemonic, setShowMnemonic] = useState(false);

  const handleRestoreOwnerClick = (): void => {
    prompt(NonEmptyString1000, "Your Mnemonic", (mnemonic) => {
      parseMnemonic(mnemonic)
        .pipe(Effect.runPromiseExit)
        .then(
          Exit.match({
            onFailure: (error) => {
              alert(JSON.stringify(error, null, 2));
            },
            onSuccess: (mnemonic) => {
              isRestoringOwner(true);
              evolu.restoreOwner(mnemonic);
            },
          })
        );
    });
  };

  const handleResetOwnerClick = (): void => {
    if (confirm("Are you sure? It will delete all your local data.")) {
      isRestoringOwner(false);
      evolu.resetOwner();
    }
  };

  return (
    <div className="mt-6">
      <p>
        Open this page on a different device and use your mnemonic to restore
        your data.
      </p>
      <Button
        title={`${showMnemonic ? "Hide" : "Show"} Mnemonic`}
        onClick={(): void => setShowMnemonic(!showMnemonic)}
      />
      <Button title="Restore Owner" onClick={handleRestoreOwnerClick} />
      <Button title="Reset Owner" onClick={handleResetOwnerClick} />
      {showMnemonic && owner != null && (
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

const prompt = <From extends string, To>(
  schema: S.Schema<From, To>,
  message: string,
  onSuccess: (value: To) => void
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

function App() {
  return <NextJsExample />;
}

export default App;
