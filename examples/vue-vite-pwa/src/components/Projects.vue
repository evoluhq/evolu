<script setup lang="ts">
import { NonEmptyTrimmedString100, sqliteTrue } from "@evolu/common";
import { waitForRows } from "@evolu/vue";
import {
  projectsQuery,
  projectsWithTodosQuery,
  promptStringWithAlert,
  useEvolu,
  useQuery,
  type ProjectsWithTodosRow,
} from "../evolu";
import ProjectTodos from "./ProjectTodos.vue";

const evolu = useEvolu();

const projectsWithTodos = useQuery(projectsWithTodosQuery);
const projects = useQuery(projectsQuery);

// Suspense shows its fallback until the first loads end, so the list never
// renders empty before its rows arrive. A failed load reaches
// DataBoundary.vue's onErrorCaptured.
const [devicePersistence] = await Promise.all([
  evolu.devicePersistence,
  waitForRows(projectsWithTodos, projects),
]);

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

<template>
  <!-- Where the browser offers no persistent storage, as in Safari's Private
    Browsing or a Firefox private window. See `DevicePersistence` in
    `@evolu/common/local-first`. -->
  <p v-if="devicePersistence === 'NotPersisted'">
    Your data isn't kept on this device. Changes that haven't synced are lost
    when you close this tab.
  </p>
  <h2>Projects</h2>
  <p v-if="projectsWithTodos.length === 0">No projects yet</p>
  <section
    v-for="project in projectsWithTodos"
    :key="project.id"
    :aria-label="project.name"
    class="card"
  >
    <h3>
      {{ project.name }}
      <button @click="renameProject(project)">Rename</button>
      <button @click="deleteProject(project)">Delete</button>
    </h3>
    <ProjectTodos :project="project" :projects="projects" />
  </section>
  <button @click="addProject()">Add Project</button>
</template>
