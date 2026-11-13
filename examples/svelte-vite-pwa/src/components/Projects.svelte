<script lang="ts">
  import { NonEmptyTrimmedString100, sqliteTrue } from "@evolu/common";
  import type { QueryState } from "@evolu/svelte";
  import { untrack } from "svelte";
  import {
    promptStringWithAlert,
    type AppEvolu,
    type ProjectsRow,
    type ProjectsWithTodosRow,
  } from "../evolu";
  import ProjectTodos from "./ProjectTodos.svelte";

  // The parent created the queries' states and awaited their first loads, so
  // their rows are there, and the list never shows empty. Their `rows` update
  // when the data changes. They don't change, so they're read once, untracked.
  const props: {
    evolu: AppEvolu;
    projectsWithTodos: QueryState<ProjectsWithTodosRow>;
    projects: QueryState<ProjectsRow>;
  } = $props();
  const evolu = untrack(() => props.evolu);
  const projectsWithTodos = untrack(() => props.projectsWithTodos);
  const projects = untrack(() => props.projects);

  const addProject = () => {
    const name = promptStringWithAlert(
      "What's the project name?",
      NonEmptyTrimmedString100,
    );
    if (name.ok) evolu.insert("project", { name: name.value });
  };

  const renameProject = (project: ProjectsWithTodosRow) => {
    const name = promptStringWithAlert(
      "Edit project name",
      NonEmptyTrimmedString100,
      project.name,
    );
    if (name.ok) evolu.update("project", { id: project.id, name: name.value });
  };

  const deleteProject = (project: ProjectsWithTodosRow) => {
    if (!confirm(`Delete project "${project.name}"?`)) return;
    // Its todos stay as they are: queries leave out the todos of a deleted
    // project. Deleting each todo would sync a change per todo and miss todos
    // other devices haven't synced yet.
    //
    // `isDeleted` keeps the row, so restoring it is an update with
    // `sqliteFalse`; the full playground's Trash shows it.
    evolu.update("project", { id: project.id, isDeleted: sqliteTrue });
  };
</script>

<section aria-label="Projects">
  <h2>Projects</h2>
  {#each projectsWithTodos.rows as project (project.id)}
    <div class="project">
      <h3>
        {project.name}
        <button class="text" onclick={() => renameProject(project)}>
          Rename
        </button>
        <button class="text" onclick={() => deleteProject(project)}>
          Delete
        </button>
      </h3>
      <ProjectTodos {evolu} {project} projects={projects.rows} />
    </div>
  {:else}
    <p class="note">No projects yet</p>
  {/each}
  <button class="primary" onclick={addProject}>Add Project</button>
</section>

<style>
  .project {
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #f3f4f6;
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 500;
  }
</style>
