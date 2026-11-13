<script setup lang="ts">
import {
  booleanToSqliteBoolean,
  NonEmptyTrimmedString100,
  sqliteTrue,
} from "@evolu/common";
import { shallowRef } from "vue";
import {
  parseStringWithAlert,
  ProjectId,
  promptStringWithAlert,
  useEvolu,
  type ProjectsRow,
  type ProjectsWithTodosRow,
} from "../evolu";

const props = defineProps<{
  project: ProjectsWithTodosRow;
  projects: ReadonlyArray<ProjectsRow>;
}>();

type Todo = ProjectsWithTodosRow["todos"][number];

const { insert, update } = useEvolu();
const newTodoTitle = shallowRef("");

const addTodo = () => {
  const title = parseStringWithAlert(
    NonEmptyTrimmedString100,
    newTodoTitle.value,
  );
  if (!title.ok) return;
  insert(
    "todo",
    { title: title.value, projectId: props.project.id },
    {
      onSuccess: () => {
        newTodoTitle.value = "";
      },
    },
  );
};

const toggleTodo = (todo: Todo) => {
  // A mutation that can't fail needs no result check.
  update("todo", {
    id: todo.id,
    isCompleted: booleanToSqliteBoolean(!todo.isCompleted),
  });
};

const moveTodo = (todo: Todo, event: Event) => {
  if (!(event.target instanceof HTMLSelectElement)) return;
  // The options are the projects' IDs, which the select reads as strings.
  const projectId = ProjectId.fromUnknown(event.target.value);
  if (projectId.ok) update("todo", { id: todo.id, projectId: projectId.value });
};

const renameTodo = (todo: Todo) => {
  const title = promptStringWithAlert(
    "Edit todo",
    NonEmptyTrimmedString100,
    todo.title,
  );
  if (title.ok) update("todo", { id: todo.id, title: title.value });
};

const deleteTodo = (todo: Todo) => {
  update("todo", { id: todo.id, isDeleted: sqliteTrue });
};
</script>

<template>
  <ol v-if="project.todos.length > 0" :aria-label="`${project.name} todos`">
    <li v-for="todo in project.todos" :key="todo.id">
      <label :class="{ completed: todo.isCompleted }">
        <input
          type="checkbox"
          :checked="!!todo.isCompleted"
          @change="toggleTodo(todo)"
        />
        {{ todo.title }}
      </label>
      <select
        aria-label="Project"
        :value="project.id"
        @change="moveTodo(todo, $event)"
      >
        <option v-for="option in projects" :key="option.id" :value="option.id">
          {{ option.name }}
        </option>
      </select>
      <button @click="renameTodo(todo)">Edit</button>
      <button @click="deleteTodo(todo)">Delete</button>
    </li>
  </ol>
  <input
    v-model="newTodoTitle"
    :aria-label="`New todo in ${project.name}`"
    placeholder="Add a new todo..."
    @keydown.enter="addTodo()"
  />
  <button @click="addTodo()">Add</button>
</template>

<style scoped>
.completed {
  text-decoration: line-through;
}
</style>
