import { Component, inject, signal } from "@angular/core";
import { AppService } from "./app.service";
import { PwaBadgeComponent } from "./pwa-badge.component";

@Component({
  selector: "app-root",
  imports: [PwaBadgeComponent],
  template: `
    <div class="min-h-screen px-8 py-8">
      <div class="mx-auto max-w-md">
        <div class="mb-2 flex items-center justify-between pb-4">
          <h1 class="w-full text-center text-xl font-semibold text-gray-900">
            Minimal Todo App (Evolu + Angular)
          </h1>
        </div>

        @if (appService.isLoading()) {
          <div class="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <p class="text-sm text-gray-600">Loading todos…</p>
          </div>
        } @else {
          <div class="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <ol class="mb-6 space-y-2">
              @for (todo of appService.todos(); track todo.id) {
                <li
                  class="-mx-2 flex items-center gap-3 px-2 py-2 hover:bg-gray-50"
                >
                  <label class="flex flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      [checked]="todo.isCompleted === 1"
                      (change)="
                        appService.toggleTodo(todo.id, $event.target.checked)
                      "
                      class="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-blue-600 checked:bg-blue-600 indeterminate:border-blue-600 indeterminate:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"
                    />
                    <span
                      class="flex-1 text-sm"
                      [class]="
                        todo.isCompleted === 1
                          ? 'text-gray-500 line-through'
                          : 'text-gray-900'
                      "
                    >
                      {{ todo.title }}
                    </span>
                  </label>
                  <div class="flex gap-1">
                    <button
                      (click)="handleRenameTodo(todo.id, todo.title)"
                      class="p-1 text-gray-400 transition-colors hover:text-blue-600"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      (click)="handleDeleteTodo(todo.id)"
                      class="p-1 text-gray-400 transition-colors hover:text-red-600"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              }
            </ol>

            <div class="flex gap-2">
              <input
                type="text"
                [value]="newTodoTitle()"
                (input)="setNewTodoTitle($event.target.value)"
                (keydown)="handleKeyDown($event)"
                placeholder="Add a new todo..."
                class="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
              <button
                type="button"
                (click)="handleAddTodo()"
                class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
        }

        <div
          class="mt-8 rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200"
        >
          <h2 class="mb-4 text-lg font-medium text-gray-900">Account</h2>
          <p class="mb-4 text-sm text-gray-600">
            Todos are stored in local SQLite. When you sync across devices, your
            data is end-to-end encrypted using your mnemonic.
          </p>

          <div class="space-y-3">
            <button
              type="button"
              (click)="handleShowMnemonic()"
              class="w-full rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              {{ showMnemonic() ? "Hide" : "Show" }} Mnemonic
            </button>

            @if (showMnemonic() && appService.mnemonic()) {
              <div class="bg-gray-50 p-3">
                <label class="mb-2 block text-xs font-medium text-gray-700">
                  Your Mnemonic (keep this safe!)
                </label>
                <textarea
                  [value]="appService.mnemonic()"
                  readonly
                  rows="3"
                  class="w-full border-b border-gray-300 bg-white px-2 py-1 font-mono text-xs focus:border-blue-500 focus:outline-none"
                ></textarea>
              </div>
            }

            <div class="flex gap-2">
              <button
                type="button"
                (click)="handleRestoreOwner()"
                class="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                Restore from Mnemonic
              </button>
              <button
                type="button"
                (click)="handleResetOwner()"
                class="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                Reset All Data
              </button>
              <button
                type="button"
                (click)="handleDownloadDatabase()"
                class="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                Download Backup
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <app-pwa-badge></app-pwa-badge>
  `,
})
export class App {
  protected readonly appService = inject(AppService);

  protected readonly showMnemonic = signal(false);
  protected readonly newTodoTitle = signal("");

  /** Todos */

  protected setNewTodoTitle(value: string) {
    this.newTodoTitle.set(value);
  }

  protected handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      this.handleAddTodo();
    }
  }

  protected handleAddTodo() {
    const title = this.newTodoTitle().trim();
    if (!title) return;

    this.appService.addTodo(title);
    this.newTodoTitle.set("");
  }

  protected handleRenameTodo(id: string, currentTitle: string) {
    const title = window.prompt("Todo Name", currentTitle);
    if (title == null) return;

    this.appService.renameTodo(id, title);
  }

  protected handleDeleteTodo(id: string) {
    this.appService.deleteTodo(id);
  }

  /** Footer button handlers */

  protected handleShowMnemonic() {
    this.showMnemonic.update((show) => !show);
  }

  protected handleRestoreOwner() {
    const mnemonic = window.prompt("Your Mnemonic");
    if (mnemonic == null) return;

    void this.appService.restoreFromMnemonic(mnemonic);
  }

  protected handleResetOwner() {
    if (confirm("Are you sure? It will delete all your local data.")) {
      void this.appService.resetAppOwner();
    }
  }

  protected handleDownloadDatabase() {
    void this.appService.downloadDatabase();
  }
}
