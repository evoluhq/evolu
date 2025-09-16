import { Component, inject, signal } from "@angular/core";
import { AppService } from "./app.service";
import { PwaBadgeComponent } from "./pwa-badge.component";
import { TodoCategoryId } from "./schema";

type Tab = "todos" | "categories";

@Component({
  selector: "app-root",
  imports: [PwaBadgeComponent],
  template: `
    <div class="space-y-6 p-4">
      <div class="space-y-2 sm:hidden">
        <label for="tabs" class="text-sm font-medium">View</label>
        <select
          id="tabs"
          name="tabs"
          [value]="currentTab()"
          (change)="handleTabChange($any($event.target).value)"
          class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          @for (tab of TABS; track tab.id) {
            <option [value]="tab.id">{{ tab.label }}</option>
          }
        </select>
      </div>

      <div class="hidden sm:block">
        <nav
          class="flex gap-3 border-b border-gray-300 pb-2 text-sm"
          role="tablist"
        >
          @for (tab of TABS; track tab.id) {
            <button
              type="button"
              (click)="currentTab.set(tab.id)"
              [attr.aria-selected]="currentTab() === tab.id"
              [class]="tabButtonClass(tab.id)"
            >
              {{ tab.label }}
            </button>
          }
        </nav>
      </div>

      @if (currentTab() === "todos") {
        <section class="space-y-4">
          @if (appService.isLoading()) {
            <p class="text-sm text-gray-600">Loading todos…</p>
          }

          @if (!appService.isLoading() && !appService.todos().length) {
            <p class="text-sm text-gray-600">
              No todos yet. Add your first todo below.
            </p>
          }

          <ul class="space-y-3">
            @for (todo of appService.todos(); track todo.id) {
              <li class="border border-gray-300 px-3 py-3">
                <div class="flex flex-wrap items-center gap-3">
                  <label class="flex flex-1 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      [checked]="todo.isCompleted === 1"
                      (change)="
                        appService.toggleTodo(todo.id, $event.target.checked)
                      "
                    />
                    <span
                      class="break-words"
                      [style.textDecoration]="
                        todo.isCompleted === 1 ? 'line-through' : 'none'
                      "
                    >
                      {{ todo.title }}
                    </span>
                  </label>

                  <select
                    [value]="getCategorySelectValue(todo)"
                    (change)="
                      handleCategorizeTodo(todo.id, $any($event.target).value)
                    "
                    class="rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="">-- no category --</option>
                    @for (category of todo.categories; track category.id) {
                      <option
                        [value]="category.id"
                        [selected]="category.id === todo.categoryId"
                      >
                        {{ category.name || "Unnamed Category" }}
                      </option>
                    }
                  </select>

                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="{{ BUTTON_CLASSES }}"
                      (click)="handleRenameTodo(todo.id, todo.title)"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      class="{{ BUTTON_CLASSES }}"
                      (click)="handleDeleteTodo(todo.id)"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      class="{{ BUTTON_CLASSES }}"
                      (click)="handleShowTodoHistory(todo.id)"
                    >
                      History
                    </button>
                  </div>
                </div>
              </li>
            }
          </ul>

          <button
            type="button"
            class="{{ BUTTON_CLASSES }}"
            (click)="handleAddTodo()"
          >
            Add Todo
          </button>
        </section>
      } @else {
        <section class="space-y-4">
          @if (!appService.categories().length) {
            <p class="text-sm text-gray-600">
              No categories yet. Create one to organize your todos.
            </p>
          }

          <ul class="space-y-3">
            @for (category of appService.categories(); track category.id) {
              <li class="border border-gray-300 px-3 py-3">
                <div class="flex flex-wrap items-center gap-2 text-sm">
                  <span>{{ category.name }}</span>
                  <div class="ml-auto flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="{{ BUTTON_CLASSES }}"
                      (click)="handleRenameCategory(category.id, category.name)"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      class="{{ BUTTON_CLASSES }}"
                      (click)="appService.deleteCategory(category.id)"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            }
          </ul>

          <button
            type="button"
            class="{{ BUTTON_CLASSES }}"
            (click)="handleAddCategory()"
          >
            Add Category
          </button>
        </section>
      }

      <section class="space-y-2 text-sm text-gray-700">
        <p>
          The data created in this example are stored locally in SQLite. Evolu
          encrypts the data for backup and sync with a mnemonic stored on your
          device.
        </p>
        <p>
          Open this page on another device and use your mnemonic to restore your
          data.
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="{{ BUTTON_CLASSES }}"
            (click)="handleShowMnemonic()"
          >
            {{ showMnemonic() ? "Hide" : "Show" }} Mnemonic
          </button>
          <button
            type="button"
            class="{{ BUTTON_CLASSES }}"
            (click)="handleRestoreOwner()"
          >
            Restore Owner
          </button>
          <button
            type="button"
            class="{{ BUTTON_CLASSES }}"
            (click)="handleResetOwner()"
          >
            Reset Owner
          </button>
          <button
            type="button"
            class="{{ BUTTON_CLASSES }}"
            (click)="handleDownloadDatabase()"
          >
            Download Database
          </button>
        </div>
        @if (showMnemonic() && appService.mnemonic()) {
          <textarea
            [value]="appService.mnemonic()"
            readonly
            rows="2"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          ></textarea>
        }
      </section>
    </div>

    <app-pwa-badge></app-pwa-badge>
  `,
})
export class App {
  protected readonly appService = inject(AppService);

  protected readonly TABS: ReadonlyArray<{ id: Tab; label: string }> = [
    { id: "todos", label: "Todos" },
    { id: "categories", label: "Categories" },
  ];

  protected readonly BUTTON_CLASSES =
    "rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50";
  protected readonly TAB_BASE_CLASSES = "px-2 py-1 text-sm border-b-2";
  protected readonly TAB_ACTIVE_CLASSES =
    "border-blue-500 font-semibold text-gray-900";
  protected readonly TAB_INACTIVE_CLASSES =
    "border-transparent text-gray-600 hover:text-gray-900";

  protected readonly showMnemonic = signal(false);
  protected readonly currentTab = signal<Tab>("todos");

  protected tabButtonClass(tab: Tab) {
    return `${this.TAB_BASE_CLASSES} ${
      this.currentTab() === tab
        ? this.TAB_ACTIVE_CLASSES
        : this.TAB_INACTIVE_CLASSES
    }`;
  }

  /** Tabs */

  protected handleTabChange(value: Tab) {
    this.currentTab.set(value === "categories" ? "categories" : "todos");
  }

  /** Todos */

  protected handleAddTodo() {
    const title = window.prompt("What needs to be done?");
    if (title == null) return;

    this.appService.addTodo(title);
  }

  protected handleRenameTodo(id: string, currentTitle: string) {
    const title = window.prompt("Todo Name", currentTitle);
    if (title == null) return;

    this.appService.renameTodo(id, title);
  }

  protected handleDeleteTodo(id: string) {
    this.appService.deleteTodo(id);
  }

  protected getCategorySelectValue(todo: any): string {
    // Reset to empty if the current categoryId is missing from todo.categories
    return todo.categoryId &&
      todo.categories.find((cat: any) => cat.id === todo.categoryId)
      ? todo.categoryId
      : "";
  }

  protected handleCategorizeTodo(todoId: string, value: string) {
    const categoryId = value ? (value as TodoCategoryId) : null;
    this.appService.assignCategoryToTodo(todoId, categoryId);
  }

  protected async handleShowTodoHistory(id: string) {
    const history = await this.appService.getTodoHistory(id);
    const historyText = history
      .map(
        (row) =>
          `${new Date(row.timestamp.millis).toISOString()}: ${row.value}`,
      )
      .join("\n");
    alert(historyText || "No history found");
  }

  /** Categories */

  protected handleAddCategory() {
    const name = window.prompt("Category Name");
    if (name) {
      this.appService.addCategory(name);
    }
  }

  protected handleRenameCategory(id: string, currentName: string | null) {
    const name = window.prompt("Category Name", currentName ?? "");
    if (name) {
      this.appService.renameCategory(id, name);
    }
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
