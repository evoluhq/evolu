<script lang="ts">
  import {
    booleanToSqliteBoolean,
    NonEmptyTrimmedString100,
    sqliteTrue,
  } from "@evolu/common";
  import {
    parseStringWithAlert,
    ProjectId,
    promptStringWithAlert,
    type AppEvolu,
    type ProjectsRow,
    type ProjectsWithTodosRow,
    type TodoRow,
  } from "../evolu";

  const {
    evolu,
    project,
    projects,
  }: {
    evolu: AppEvolu;
    project: ProjectsWithTodosRow;
    projects: ReadonlyArray<ProjectsRow>;
  } = $props();

  let newTodoTitle = $state("");

  const addTodo = () => {
    const title = parseStringWithAlert(NonEmptyTrimmedString100, newTodoTitle);
    if (!title.ok) return;
    evolu.insert(
      "todo",
      { title: title.value, projectId: project.id },
      {
        onSuccess: () => {
          newTodoTitle = "";
        },
      },
    );
  };

  const toggleTodo = (todo: TodoRow) => {
    // A mutation that can't fail needs no result check.
    evolu.update("todo", {
      id: todo.id,
      isCompleted: booleanToSqliteBoolean(!todo.isCompleted),
    });
  };

  const moveTodo = (todo: TodoRow, value: string) => {
    // The options are the projects' IDs, which the select reads as strings.
    const projectId = ProjectId.fromUnknown(value);
    if (projectId.ok)
      evolu.update("todo", { id: todo.id, projectId: projectId.value });
  };

  const renameTodo = (todo: TodoRow) => {
    const title = promptStringWithAlert(
      "Edit todo",
      NonEmptyTrimmedString100,
      todo.title,
    );
    if (title.ok) evolu.update("todo", { id: todo.id, title: title.value });
  };
</script>

{#if project.todos.length > 0}
  <ol aria-label={`${project.name} todos`}>
    {#each project.todos as todo (todo.id)}
      <li>
        <label class:completed={todo.isCompleted}>
          <input
            type="checkbox"
            checked={!!todo.isCompleted}
            onchange={() => toggleTodo(todo)}
          />
          {todo.title}
        </label>
        <select
          aria-label="Project"
          value={project.id}
          onchange={(e) => moveTodo(todo, e.currentTarget.value)}
        >
          {#each projects as option (option.id)}
            <option value={option.id}>{option.name}</option>
          {/each}
        </select>
        <button class="text" onclick={() => renameTodo(todo)}>Edit</button>
        <button
          class="text"
          onclick={() =>
            evolu.update("todo", { id: todo.id, isDeleted: sqliteTrue })}
        >
          Delete
        </button>
      </li>
    {/each}
  </ol>
{/if}
<div class="add-todo">
  <input
    type="text"
    bind:value={newTodoTitle}
    aria-label={`New todo in ${project.name}`}
    placeholder="Add a new todo..."
    onkeydown={(e) => {
      if (e.key === "Enter") addTodo();
    }}
  />
  <button class="primary" onclick={addTodo}>Add</button>
</div>

<style>
  label {
    flex: 1;
    font-size: 0.875rem;
  }

  .completed {
    color: #6b7280;
    text-decoration: line-through;
  }

  .add-todo {
    display: flex;
    gap: 0.5rem;
  }

  .add-todo input {
    flex: 1;
  }
</style>
