<script lang="ts">
  import * as Evolu from "@evolu/common";
  import { appOwnerState, evoluSvelteDeps, queryState } from "@evolu/svelte";

  // Primary keys are branded types, preventing accidental use of IDs across
  // different tables (e.g., a TodoId can't be used where a UserId is expected).
  const TodoId = Evolu.id("Todo");
  type TodoId = typeof TodoId.Type;

  // Schema defines database structure with runtime validation.
  // Column types validate data on insert/update/upsert.
  const Schema = {
    todo: {
      id: TodoId,
      // Branded type ensuring titles are non-empty and ≤100 chars.
      title: Evolu.NonEmptyString100,
      // SQLite doesn't support the boolean type; it uses 0 and 1 instead.
      isCompleted: Evolu.nullOr(Evolu.SqliteBoolean),
    },
  };

  // Create Evolu instance for the Svelte platform.
  const evolu = Evolu.createEvolu(evoluSvelteDeps)(Schema, {
    reloadUrl: "/",
    name: Evolu.SimpleName.orThrow("evolu-svelte-minimal"),

    ...(process.env.NODE_ENV === "development" && {
      transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
    }),
  });

  /**
   * Subscribe to unexpected Evolu errors (database, network, sync issues).
   * These should not happen in normal operation, so always log them for
   * debugging. Show users a friendly error message instead of technical
   * details.
   */
  evolu.subscribeError(() => {
    const error = evolu.getError();
    if (!error) return;

    alert("🚨 Evolu error occurred! Check the console.");
    console.error(error);
  });

  // Evolu uses Kysely for type-safe SQL (https://kysely.dev/).
  const todosQuery = evolu.createQuery((db) =>
    db
      // Type-safe SQL: try autocomplete for table and column names.
      .selectFrom("todo")
      .select(["id", "title", "isCompleted"])
      // Soft delete: filter out deleted rows.
      .where("isDeleted", "is not", Evolu.sqliteTrue)
      // Like GraphQL, all columns except id are nullable in queries (even if
      // defined as non-nullable in schema). This enables schema evolution (no
      // migrations/versioning). Filter nulls with where + $narrowType.
      .where("title", "is not", null)
      .$narrowType<{ title: Evolu.kysely.NotNull }>()
      // Columns createdAt, updatedAt, isDeleted are auto-added to all tables.
      .orderBy("createdAt"),
  );

  const allTodos = queryState(evolu, () => todosQuery);

  const appOwner = appOwnerState(evolu);

  const { insert, update } = evolu;

  let newTodoTitle = $state("");
  let showMnemonic = $state(false);

  const handleAddTodo = () => {
    const result = insert("todo", { title: newTodoTitle.trim() });

    if (result.ok) {
      newTodoTitle = "";
    } else {
      alert(formatTypeError(result.error));
    }
  };

  const handleToggleCompletedClick = (id: TodoId, isCompleted: boolean) => {
    update("todo", { id, isCompleted: Number(!isCompleted) });
  };

  const handleRenameTodoClick = (id: TodoId, currentTitle: string) => {
    const newTitle = window.prompt("Edit todo", currentTitle);
    if (newTitle == null) return;

    const result = update("todo", { id, title: newTitle });
    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  };

  const handleDeleteTodoClick = (id: TodoId) => {
    update("todo", {
      id,
      // Soft delete with isDeleted flag (CRDT-friendly, preserves sync history).
      isDeleted: Evolu.sqliteTrue,
    });
  };

  // Restore owner from mnemonic to sync data across devices.
  const handleRestoreAppOwnerClick = () => {
    const mnemonic = window.prompt("Enter your mnemonic to restore your data:");
    if (mnemonic == null) return;

    const result = Evolu.Mnemonic.from(mnemonic.trim());
    if (!result.ok) {
      alert(formatTypeError(result.error));
      return;
    }

    evolu.restoreAppOwner(result.value);
  };

  const handleResetAppOwnerClick = () => {
    if (confirm("Are you sure? This will delete all your local data.")) {
      evolu.resetAppOwner();
    }
  };

  const handleDownloadDatabaseClick = async () => {
    const array = await evolu.exportDatabase();
    const blob = new Blob([array.slice()], { type: "application/x-sqlite3" });
    const a = document.createElement("a");
    document.body.appendChild(a);
    a.href = window.URL.createObjectURL(blob);
    a.download = "todos.sqlite3";
    a.addEventListener("click", function () {
      setTimeout(function () {
        window.URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
    });
    a.click();
  };

  /**
   * Formats Evolu Type errors into user-friendly messages.
   *
   * Evolu Type typed errors ensure every error type used in schema must have a
   * formatter. TypeScript enforces this at compile-time, preventing unhandled
   * validation errors from reaching users.
   *
   * The `createFormatTypeError` function handles both built-in and custom
   * errors, and lets us override default formatting for specific errors.
   */
  const formatTypeError = Evolu.createFormatTypeError<
    Evolu.MinLengthError | Evolu.MaxLengthError
  >((error): string => {
    switch (error.type) {
      case "MinLength":
        return `Text must be at least ${error.min} character${error.min === 1 ? "" : "s"} long`;
      case "MaxLength":
        return `Text is too long (maximum ${error.max} characters)`;
    }
  });
</script>

<div class="app-container">
  <div class="content-wrapper">
    <div class="header">
      <h1>Minimal Todo App (Evolu + Svelte + Vite + PWA)</h1>
    </div>

    <!-- Todos Section -->
    <div class="todos-section">
      <ul class="todos-list">
        {#each allTodos.rows as todo}
          <li class="todo-item">
            <label class="todo-label">
              <input
                type="checkbox"
                checked={!!todo.isCompleted}
                onchange={() =>
                  handleToggleCompletedClick(todo.id, todo.isCompleted === 1)}
                class="todo-checkbox"
              />
              <span class="todo-title" class:completed={todo.isCompleted === 1}>
                {todo.title}
              </span>
            </label>
            <div class="todo-actions">
              <button
                onclick={() => handleRenameTodoClick(todo.id, todo.title)}
                class="action-btn edit-btn"
                title="Edit"
              >
                ✏️
              </button>
              <button
                onclick={() => handleDeleteTodoClick(todo.id)}
                class="action-btn delete-btn"
                title="Delete"
              >
                🗑️
              </button>
            </div>
          </li>
        {/each}
      </ul>

      <div class="add-todo">
        <input
          type="text"
          bind:value={newTodoTitle}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              handleAddTodo();
            }
          }}
          placeholder="Add a new todo..."
          class="todo-input"
        />
        <button onclick={handleAddTodo} class="add-btn">Add</button>
      </div>
    </div>

    <!-- Owner Actions Section -->
    <div class="owner-section">
      <h2>Account</h2>
      <p class="owner-description">
        Todos are stored in local SQLite. When you sync across devices, your
        data is end-to-end encrypted using your mnemonic.
      </p>

      <div class="owner-actions">
        <button
          onclick={() => {
            showMnemonic = !showMnemonic;
          }}
          class="owner-btn full-width"
        >
          {showMnemonic ? "Hide" : "Show"} Mnemonic
        </button>

        {#if showMnemonic && appOwner.current?.mnemonic}
          <div class="mnemonic-display">
            <label class="mnemonic-label" for="mnemonic-textarea">
              Your Mnemonic (keep this safe!)
            </label>
            <textarea
              id="mnemonic-textarea"
              value={appOwner.current.mnemonic}
              readonly
              rows="3"
              class="mnemonic-textarea"
            ></textarea>
          </div>
        {/if}

        <div class="owner-buttons">
          <button onclick={handleRestoreAppOwnerClick} class="owner-btn">
            Restore from Mnemonic
          </button>
          <button onclick={handleResetAppOwnerClick} class="owner-btn">
            Reset All Data
          </button>
          <button onclick={handleDownloadDatabaseClick} class="owner-btn">
            Download Backup
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .app-container {
    min-height: 100vh;
    padding: 2rem;
  }

  .content-wrapper {
    max-width: 28rem;
    margin: 0 auto;
  }

  .header {
    margin-bottom: 0.5rem;
    padding-bottom: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header h1 {
    width: 100%;
    text-align: center;
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
    margin: 0;
  }

  .todos-section {
    background-color: white;
    border-radius: 0.5rem;
    padding: 1.5rem;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    border: 1px solid #e5e7eb;
    margin-bottom: 2rem;
  }

  .todos-list {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .todo-item {
    margin: -0.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    border-radius: 0.25rem;
    transition: background-color 0.15s ease;
  }

  .todo-item:hover {
    background-color: #f9fafb;
  }

  .todo-label {
    display: flex;
    flex: 1;
    cursor: pointer;
    align-items: center;
    gap: 0.75rem;
  }

  .todo-checkbox {
    appearance: none;
    border-radius: 0.125rem;
    border: 1px solid #d1d5db;
    background-color: white;
    width: 1rem;
    height: 1rem;
    position: relative;
    cursor: pointer;
  }

  .todo-checkbox:checked {
    border-color: #2563eb;
    background-color: #2563eb;
  }

  .todo-checkbox:checked::after {
    content: "✓";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 0.75rem;
    font-weight: bold;
  }

  .todo-checkbox:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
  }

  .todo-title {
    flex: 1;
    font-size: 0.875rem;
    text-align: left;
    color: #111827;
  }

  .todo-title.completed {
    color: #6b7280;
    text-decoration: line-through;
  }

  .todo-actions {
    display: flex;
    gap: 0.25rem;
  }

  .action-btn {
    padding: 0.25rem;
    color: #9ca3af;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 0.25rem;
    transition: color 0.15s ease;
    font-size: 1rem;
  }

  .edit-btn:hover {
    color: #2563eb;
  }

  .delete-btn:hover {
    color: #dc2626;
  }

  .add-todo {
    display: flex;
    gap: 0.5rem;
  }

  .todo-input {
    display: block;
    width: 100%;
    border-radius: 0.375rem;
    background-color: white;
    padding: 0.375rem 0.75rem;
    font-size: 1rem;
    color: #111827;
    border: 1px solid #d1d5db;
    outline: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .todo-input::placeholder {
    color: #9ca3af;
  }

  .todo-input:focus {
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }

  .add-btn {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 0.5rem;
    background-color: #2563eb;
    color: white;
    border: none;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .add-btn:hover {
    background-color: #1d4ed8;
  }

  .owner-section {
    background-color: white;
    border-radius: 0.5rem;
    padding: 1.5rem;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    border: 1px solid #e5e7eb;
  }

  .owner-section h2 {
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
    font-weight: 500;
    color: #111827;
  }

  .owner-description {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    color: #6b7280;
  }

  .owner-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .owner-btn {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 0.5rem;
    background-color: #f3f4f6;
    color: #374151;
    border: none;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .owner-btn:hover {
    background-color: #e5e7eb;
  }

  .full-width {
    width: 100%;
  }

  .mnemonic-display {
    background-color: #f9fafb;
    padding: 0.75rem;
    border-radius: 0.375rem;
  }

  .mnemonic-label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: #374151;
  }

  .mnemonic-textarea {
    width: 100%;
    border-bottom: 1px solid #d1d5db;
    background-color: white;
    padding: 0.5rem;
    font-family: "Courier New", monospace;
    font-size: 0.75rem;
    border: none;
    border-bottom: 1px solid #d1d5db;
    outline: none;
    resize: none;
  }

  .mnemonic-textarea:focus {
    border-bottom-color: #2563eb;
  }

  .owner-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .owner-buttons .owner-btn {
    flex: 1;
    min-width: 0;
  }
</style>
