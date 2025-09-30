<script lang="ts">
  import {
    DateIso,
    NonEmptyString,
    NonEmptyString1000,
    SimpleName,
    SqliteBoolean,
    createEvolu,
    createFormatTypeError,
    id,
    kysely,
    maxLength,
    nullOr,
    sqliteTrue,
    union,
    type EvoluSchema,
    type InferType,
    type MinLengthError,
    type ValidMutationSizeError,
  } from "@evolu/common";

  import { evoluSvelteDeps, queryState } from "@evolu/svelte";

  // Let's start with typed primary keys.
  const TodoId = id("Todo");
  // you can redeclare the TodoId as type in normal ts files, seems not possible inside a svelte file
  // but we want to keep the full example in one file, so we have to rename this here with a suffix
  type TodoId = typeof TodoId.Type;

  const TodoCategoryId = id("TodoCategory");
  type TodoCategoryIdType = typeof TodoCategoryId.Type;

  // A custom branded Type.
  const NonEmptyString50 = maxLength(50)(NonEmptyString);
  // string & Brand<"MinLength1"> & Brand<"MaxLength50">
  type NonEmptyString50 = typeof NonEmptyString50.Type;

  const TodoPriority = union("low", "high");
  type TodoPriority = typeof TodoPriority.Type;

  const PriorityList = TodoPriority.members.map((u) => u.expected);

  // Database schema.
  const DatabaseSchema = {
    todo: {
      id: TodoId,
      title: NonEmptyString1000,
      // SQLite doesn't support Boolean, so we use SqliteBoolean (0 or 1) instead.
      isCompleted: nullOr(SqliteBoolean),
      // SQLite doesn't support Date, so we use DateIso instead.
      completedAt: nullOr(DateIso),
      categoryId: nullOr(TodoCategoryId),
      priority: TodoPriority,
    },
    todoCategory: {
      id: TodoCategoryId,
      name: NonEmptyString50,
    },
  } satisfies EvoluSchema;

  type DatabaseSchema = typeof DatabaseSchema;

  const evolu = createEvolu(evoluSvelteDeps)(DatabaseSchema, {
    reloadUrl: "/",
    name: SimpleName.orThrow("evolu-svelte-example"),

    ...(process.env.NODE_ENV === "development" && {
      transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
    }),

    // Indexes are not necessary for development but are recommended for production.
    // https://www.evolu.dev/docs/indexes
    indexes: (create) => [
      create("todoCreatedAt").on("todo").column("createdAt"),
      create("todoCategoryCreatedAt").on("todoCategory").column("createdAt"),
    ],

    // enableLogging: true,
  });

  // Evolu queries should be collocated. If necessary, they can be preloaded.
  export const todosWithCategories = evolu.createQuery(
    (db) =>
      db
        .selectFrom("todo")
        .select(["id", "title", "isCompleted", "categoryId", "priority"])
        .where("isDeleted", "is not", 1)
        // Filter null value and ensure non-null type.
        .where("title", "is not", null)
        .$narrowType<{ title: kysely.NotNull }>()
        .orderBy("createdAt"),
    {
      // logQueryExecutionTime: true,
      // logExplainQueryPlan: true,
    },
  );

  const todoCategories = evolu.createQuery((db) =>
    db
      .selectFrom("todoCategory")
      .select(["id", "name"])
      .where("isDeleted", "is not", 1)
      // Filter null value and ensure non-null type.
      .where("name", "is not", null)
      .$narrowType<{ name: kysely.NotNull }>()
      .orderBy("createdAt"),
  );

  const allTodos = queryState(evolu, () => todosWithCategories);
  const allCategories = queryState(evolu, () => todoCategories);

  const { insert, update } = evolu;

  const createNewTodo = () => {
    customPrompt(NonEmptyString1000, "New Todo", (title) => {
      insert("todo", { title, priority: "low" });
    });
  };

  const createNewCategory = () => {
    customPrompt(NonEmptyString50, "New Category", (name) => {
      insert("todoCategory", { name });
    });
  };

  const handleUpdateCategory = (id: TodoId, categoryId: TodoCategoryIdType) => {
    update("todo", { id, categoryId });
  };

  const handleUpdatePriority = (id: TodoId, priority: TodoPriority) => {
    update("todo", { id, priority });
  };

  const handleToggleCompletedClick = (id: TodoId, isCompleted: boolean) => {
    update("todo", { id, isCompleted: Number(!isCompleted) });
  };

  const handleRenameTodoClick = (id: TodoId) => {
    customPrompt(NonEmptyString1000, "New Name", (title) => {
      update("todo", { id, title });
    });
  };

  const handleRenameCategoryClick = (id: TodoCategoryIdType) => {
    customPrompt(NonEmptyString50, "New Name", (name) => {
      update("todoCategory", { id, name });
    });
  };

  const handleDeleteTodoClick = (id: TodoId) => {
    update("todo", { id, isDeleted: sqliteTrue });
  };

  const handleDeleteCategoryClick = (id: TodoCategoryIdType) => {
    update("todoCategory", { id, isDeleted: sqliteTrue });
  };

  /**
   * Prompts the user for a string and parses it with the given type.
   *
   * This code demonstrates the usefulness of typed Evolu Types errors. Anytime
   * an Evolu Type is added, the TypeScript compiler enforces its error is
   * handled.
   */
  const customPrompt = <
    Type extends typeof NonEmptyString1000 | typeof NonEmptyString50,
  >(
    type: Type,
    message: string,
    onSuccess: (value: InferType<Type>) => void,
  ): void => {
    const value = window.prompt(message);
    // prompt returns null on cancel/escape key
    if (value == null) return;

    const result = type.from(value);
    if (!result.ok) {
      const message = formatTypeError(result.error);
      alert(message);
      return;
    }
    onSuccess(result.value as never);
  };

  /**
   * The `createFormatTypeError` function creates a unified error formatter that
   * handles both Evolu Type's built-in errors and custom errors. It also lets
   * us override the default formatting for specific errors.
   *
   * If you prefer not to reuse built-in error formatters, you can write your
   * own `formatTypeError` function from scratch. See the commented-out example
   * at the end of this file.
   */
  const formatTypeError = createFormatTypeError<
    ValidMutationSizeError | MinLengthError
  >((error): string => {
    switch (error.type) {
      /**
       * If schema types are used correctly (e.g., maxLength), this error should
       * not occur. If it does, it indicates a developer mistake.
       */
      case "ValidMutationSize":
        return "This is a developer error, it should not happen 🤨";
      // Overrides a built-in error formatter.
      case "MinLength":
        return `Minimal length is: ${error.min}`;
    }
  });

  function onCategoryChange(event: Event, id: TodoId) {
    if (!(event.target instanceof HTMLSelectElement)) return;

    handleUpdateCategory(
      id,
      event.target.value as unknown as TodoCategoryIdType,
    );
  }

  function onPriorityChange(event: Event, id: TodoId) {
    if (!(event.target instanceof HTMLSelectElement)) return;

    handleUpdatePriority(id, event.target.value as unknown as TodoPriority);
  }
</script>

<main>
  <h1>Categories</h1>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each allCategories.rows as category}
        <tr>
          <td>{category.name}</td>
          <td>
            <button onclick={() => handleRenameCategoryClick(category.id)}>
              Rename
            </button>
            <button onclick={() => handleDeleteCategoryClick(category.id)}>
              Delete
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <button onclick={() => createNewCategory()}> Create Category </button>

  <h1>Todos</h1>
  <table>
    <thead>
      <tr>
        <th>Title</th>
        <th>Categories</th>
        <th>Priority</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each allTodos.rows as todo}
        <tr>
          <td class={{ completed: todo.isCompleted === 1 }}>{todo.title}</td>
          <td>
            <select
              value={todo.categoryId}
              onchange={(e) => onCategoryChange(e, todo.id)}
            >
              {#each allCategories.rows as category}
                <option value={category.id}>
                  {category.name}
                </option>
              {/each}
            </select>
          </td>
          <td>
            <select
              value={todo.priority}
              onchange={(e) => onPriorityChange(e, todo.id)}
            >
              {#each PriorityList as priority}
                <option value={priority}>
                  {priority}
                </option>
              {/each}
            </select>
          </td>
          <td>
            <button
              onclick={() =>
                handleToggleCompletedClick(todo.id, todo.isCompleted === 1)}
            >
              {todo.isCompleted ? "Mark Incomplete" : "Mark Complete"}
            </button>
            <button onclick={() => handleRenameTodoClick(todo.id)}>
              Rename
            </button>
            <button onclick={() => handleDeleteTodoClick(todo.id)}>
              Delete
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <button onclick={() => createNewTodo()}> Create Todo </button>

  <div class="owner-actions">
    <button onclick={() => evolu.resetAppOwner()}> Reset Owner </button>
  </div>
</main>

<style>
  .completed {
    text-decoration: line-through;
  }

  .owner-actions {
    margin-top: 2rem;
  }
</style>
