<script setup lang="ts">
import {
  NonEmptyString1000,
  createFormatTypeError,
  kysely,
  type InferType,
  type MinLengthError,
  type ValidMutationSizeError,
} from "@evolu/common";

import { useQuery } from "@evolu/vue";
import {
  NonEmptyString50,
  PriorityList,
  TodoId,
  TodoPriority,
  useEvolu,
  type TodoCategoryIdType,
} from "../composables/useEvolu";

const evolu = useEvolu();

// Evolu queries should be collocated. If necessary, they can be preloaded.
const todosWithCategories = evolu.createQuery(
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

const allTodos = useQuery(todosWithCategories);
const allCategories = useQuery(todoCategories);

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
  update("todo", { id, isCompleted: !isCompleted });
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
  update("todo", { id, isDeleted: true });
};

const handleDeleteCategoryClick = (id: TodoCategoryIdType) => {
  update("todoCategory", { id, isDeleted: true });
};

/**
 * Prompts the user for a string and parses it with the given type.
 *
 * This code demonstrates the usefulness of typed Evolu Types errors. Anytime an
 * Evolu Type is added, the TypeScript compiler enforces its error is handled.
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
 * handles both Evolu Type's built-in errors and custom errors. It also lets us
 * override the default formatting for specific errors.
 *
 * If you prefer not to reuse built-in error formatters, you can write your own
 * `formatTypeError` function from scratch. See the commented-out example at the
 * end of this file.
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

  handleUpdateCategory(id, event.target.value as unknown as TodoCategoryIdType);
}

function onPriorityChange(event: Event, id: TodoId) {
  if (!(event.target instanceof HTMLSelectElement)) return;

  handleUpdatePriority(id, event.target.value as unknown as TodoPriority);
}
</script>

<template>
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
        <tr v-for="category in allCategories">
          <td>{{ category.name }}</td>
          <td>
            <button @click="handleRenameCategoryClick(category.id)">
              Rename
            </button>
            <button @click="handleDeleteCategoryClick(category.id)">
              Delete
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <button @click="createNewCategory()">Create Category</button>

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
        <tr v-for="todo in allTodos">
          <td :class="{ completed: todo.isCompleted === 1 }">
            {{ todo.title }}
          </td>
          <td>
            <select
              :value="todo.categoryId"
              @change="onCategoryChange($event, todo.id)"
            >
              <option v-for="category in allCategories" :value="category.id">
                {{ category.name }}
              </option>
            </select>
          </td>
          <td>
            <select
              :value="todo.priority"
              @change="onPriorityChange($event, todo.id)"
            >
              <option v-for="priority in PriorityList" :value="priority">
                {{ priority }}
              </option>
            </select>
          </td>
          <td>
            <button
              @click="
                handleToggleCompletedClick(todo.id, todo.isCompleted === 1)
              "
            >
              {{ todo.isCompleted ? "Mark Incomplete" : "Mark Complete" }}
            </button>
            <button @click="handleRenameTodoClick(todo.id)">Rename</button>
            <button @click="handleDeleteTodoClick(todo.id)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>

    <button @click="createNewTodo()">Create Todo</button>

    <div class="owner-actions">
      <button @click="evolu.resetAppOwner()">Reset Owner</button>
    </div>
  </main>
</template>

<style>
.completed {
  text-decoration: line-through;
}

.owner-actions {
  margin-top: 2rem;
}
</style>
