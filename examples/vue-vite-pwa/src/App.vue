<script setup lang="ts">
import {
  NonEmptyString,
  NonEmptyString1000,
  SimpleName,
  SqliteBoolean,
  sqliteTrue,
  createEvolu,
  createFormatTypeError,
  getOrThrow,
  id,
  kysely,
  maxLength,
  nullOr,
  type EvoluSchema,
  type InferType,
  type MinLengthError,
  type ValidMutationSizeError,
  union,
} from "@evolu/common";
import { evoluWebDeps } from "@evolu/web";
import { provideEvolu, useQuery } from "@evolu/vue";

const isDev = !!import.meta.env.DEV;

const TodoId = id("Todo");
type TodoId = typeof TodoId.Type;

const TodoCategoryId = id("TodoCategory");
type TodoCategoryIdType = typeof TodoCategoryId.Type;

const NonEmptyString50 = maxLength(50)(NonEmptyString);
type NonEmptyString50 = typeof NonEmptyString50.Type;

const TodoPriority = union("low", "high");
type TodoPriority = typeof TodoPriority.Type;

const PriorityList = TodoPriority.members.map(
  (member: (typeof TodoPriority.members)[number]) => member.expected,
) as readonly TodoPriority[];

const DatabaseSchema = {
  todo: {
    id: TodoId,
    title: NonEmptyString1000,
    isCompleted: nullOr(SqliteBoolean),
    categoryId: nullOr(TodoCategoryId),
    priority: TodoPriority,
  },
  todoCategory: {
    id: TodoCategoryId,
    name: NonEmptyString50,
  },
} satisfies EvoluSchema;

type DatabaseSchema = typeof DatabaseSchema;

const evolu = createEvolu(evoluWebDeps)(DatabaseSchema, {
  reloadUrl: "/",
  name: getOrThrow(SimpleName.from("evolu-vue-example")),
  ...(isDev && {
    transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
  }),
  indexes: (create) => [
    create("todoCreatedAt").on("todo").column("createdAt"),
    create("todoCategoryCreatedAt").on("todoCategory").column("createdAt"),
  ],
});

provideEvolu(evolu);

const todosWithCategories = evolu.createQuery((db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "categoryId", "priority"])
      .where("isDeleted", "is not", 1)
      .where("title", "is not", null)
      .$narrowType<{ title: kysely.NotNull }>()
      .orderBy("createdAt"),
);

const todoCategories = evolu.createQuery((db) =>
  db
    .selectFrom("todoCategory")
    .select(["id", "name"])
    .where("isDeleted", "is not", 1)
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
  update("todo", { id, isCompleted: Number(!isCompleted) as 0 | 1 });
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

const customPrompt = <
  Type extends typeof NonEmptyString1000 | typeof NonEmptyString50,
>(
  type: Type,
  message: string,
  onSuccess: (value: InferType<Type>) => void,
): void => {
  const value = window.prompt(message);
  if (value == null) return;

  const result = type.from(value);
  if (!result.ok) {
    alert(formatTypeError(result.error));
    return;
  }
  onSuccess(result.value as never);
};

const formatTypeError = createFormatTypeError<
  ValidMutationSizeError | MinLengthError
>((error): string => {
  switch (error.type) {
    case "ValidMutationSize":
      return "This is a developer error, it should not happen 🤨";
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
        <tr v-for="category in allCategories" :key="category.id">
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
        <tr v-for="todo in allTodos" :key="todo.id">
          <td :class="{ completed: todo.isCompleted === 1 }">
            {{ todo.title }}
          </td>
          <td>
            <select
              :value="todo.categoryId"
              @change="onCategoryChange($event, todo.id)"
            >
              <option v-for="category in allCategories" :value="category.id" :key="category.id">
                {{ category.name }}
              </option>
            </select>
          </td>
          <td>
            <select
              :value="todo.priority"
              @change="onPriorityChange($event, todo.id)"
            >
              <option v-for="priority in PriorityList" :value="priority" :key="priority">
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
