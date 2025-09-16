import { Injectable, OnDestroy, inject, signal } from "@angular/core";
import {
  InferRow,
  Mnemonic,
  Query,
  Row,
  binaryTimestampToTimestamp,
  idToBinaryId,
  kysely,
} from "@evolu/common";
import { EVOLU } from "./app.config";
import { formatTypeError } from "./error-formatter";
import { Person, TodoCategoryId, TodoId } from "./schema";

@Injectable({ providedIn: "root" })
export class AppService implements OnDestroy {
  private readonly evolu = inject(EVOLU);
  private readonly unsubscribes: Array<() => void> = [];

  private readonly categoriesQuery = this.evolu.createQuery((db) =>
    db
      .selectFrom("todoCategory")
      .select(["id", "name"])
      .where("isDeleted", "is not", 1)
      .where("name", "is not", null)
      .$narrowType<{ name: kysely.NotNull }>()
      .orderBy("createdAt"),
  );

  private readonly todosWithCategoriesQuery = this.evolu.createQuery((db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "categoryId", "personJson"])
      .where("isDeleted", "is not", 1)
      .where("title", "is not", null)
      .$narrowType<{ title: kysely.NotNull }>()
      .orderBy("createdAt")
      .select((eb) => [
        kysely
          .jsonArrayFrom(
            eb
              .selectFrom("todoCategory")
              .select(["todoCategory.id", "todoCategory.name"])
              .where("isDeleted", "is not", 1)
              .orderBy("createdAt"),
          )
          .as("categories"),
      ]),
  );

  readonly todos = signal<InferRow<typeof this.todosWithCategoriesQuery>[]>([]);
  readonly categories = signal<InferRow<typeof this.categoriesQuery>[]>([]);

  readonly mnemonic = signal<string | null>(null);

  readonly isLoading = signal(true);

  constructor() {
    this.initializeData();
    this.initializeAppOwner();
    this.initializeGlobalErrorHandling();
  }

  ngOnDestroy(): void {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  /** Todos */

  addTodo(title: string) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    const result = this.evolu.insert("todo", {
      title: trimmedTitle,
      personJson: { name: "Joe", age: 32 } as Person,
    });

    // Example error-handling, ommitted from here on for brevity.
    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  }

  renameTodo(id: string, title: string) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    const result = this.evolu.update("todo", {
      id: id as TodoId,
      title: trimmedTitle,
    });

    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  }

  toggleTodo(id: string, isCompleted: boolean) {
    this.evolu.update("todo", {
      id: id as TodoId,
      isCompleted,
    });
  }

  assignCategoryToTodo(todoId: string, categoryId: TodoCategoryId | null) {
    this.evolu.update("todo", {
      id: todoId as TodoId,
      categoryId,
    });
  }

  deleteTodo(id: string) {
    this.evolu.update("todo", {
      id: id as TodoId,
      isDeleted: true,
    });
  }

  async getTodoHistory(todoId: string) {
    const titleHistoryQuery = this.evolu.createQuery((db) =>
      db
        .selectFrom("evolu_history")
        .select(["value", "timestamp"])
        .where("table", "==", "todo")
        .where("id", "==", idToBinaryId(todoId as TodoId))
        .where("column", "==", "title")
        .$narrowType<{ value: string }>()
        .orderBy("timestamp", "desc"),
    );

    try {
      const rows = await this.evolu.loadQuery(titleHistoryQuery);
      return rows.map((row) => ({
        ...row,
        timestamp: binaryTimestampToTimestamp(row.timestamp),
      }));
    } catch (error) {
      console.error("Failed to load todo history:", error);
      return [];
    }
  }

  /** Categories */

  addCategory(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    const result = this.evolu.insert("todoCategory", {
      name: trimmedName,
    });

    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  }

  renameCategory(id: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    const result = this.evolu.update("todoCategory", {
      id: id as TodoCategoryId,
      name: trimmedName,
    });

    if (!result.ok) {
      alert(formatTypeError(result.error));
    }
  }

  deleteCategory(id: string) {
    this.evolu.update("todoCategory", {
      id: id as TodoCategoryId,
      isDeleted: true,
    });
  }

  /** App owner */

  async restoreFromMnemonic(mnemonic: string): Promise<void> {
    const trimmedMnemonic = mnemonic.trim();
    if (!trimmedMnemonic) {
      return;
    }

    const mnemonicResult = Mnemonic.from(trimmedMnemonic);
    if (!mnemonicResult.ok) {
      alert(formatTypeError(mnemonicResult.error));
      return;
    }

    await this.evolu.restoreAppOwner(mnemonicResult.value);
  }

  async resetAppOwner(): Promise<void> {
    await this.evolu.resetAppOwner();
  }

  /** Database */

  async downloadDatabase(): Promise<void> {
    try {
      const array = await this.evolu.exportDatabase();
      const blob = new Blob([array.slice()], {
        type: "application/x-sqlite3",
      });
      const element = document.createElement("a");
      document.body.appendChild(element);
      element.href = window.URL.createObjectURL(blob);
      element.download = "db.sqlite3";
      element.addEventListener("click", () => {
        setTimeout(() => {
          window.URL.revokeObjectURL(element.href);
          element.remove();
        }, 1000);
      });
      element.click();
    } catch (error) {
      console.error("Failed to download database:", error);
    }
  }

  /** App lifecycle */

  private initializeData(): void {
    const todosPromise = this.loadAndSubscribeEvoluQuery(
      this.todosWithCategoriesQuery,
      (rows) => this.todos.set(rows),
    );
    const categoriesPromise = this.loadAndSubscribeEvoluQuery(
      this.categoriesQuery,
      (rows) => this.categories.set(rows),
    );

    Promise.all([todosPromise, categoriesPromise])
      .catch((error) => {
        console.error("Failed to load data:", error);
      })
      .finally(() => this.isLoading.set(false));
  }

  private initializeAppOwner(): void {
    const updateMnemonic = () => {
      const owner = this.evolu.getAppOwner();
      this.mnemonic.set(owner?.mnemonic || null);
    };

    updateMnemonic();
    this.unsubscribes.push(this.evolu.subscribeAppOwner(updateMnemonic));
  }

  private initializeGlobalErrorHandling(): void {
    // Subscribe to global Evolu errors
    const unsubscribeError = this.evolu.subscribeError(() => {
      const error = this.evolu.getError();
      if (!error) return;

      console.error("Evolu error:", error);
      alert("🚨 Evolu error occurred! Check the console.");
    });

    this.unsubscribes.push(unsubscribeError);
  }

  /**
   * Execute an Evolu query once and subscribe to updates, communicated via the
   * callback.
   *
   * Keeps track of the subscription so it can be cleaned up later.
   *
   * @returns A promise that resolves after the initial data is retrieved.
   */
  private loadAndSubscribeEvoluQuery<R extends Row>(
    query: Query<R>,
    cb: (rows: R[]) => void,
  ) {
    const unsubscribe = this.evolu.subscribeQuery(query)(() =>
      cb([...this.evolu.getQueryRows(query)]),
    );
    this.unsubscribes.push(unsubscribe);

    return this.evolu.loadQuery(query).then((rows) => {
      cb([...rows]);
      return rows;
    });
  }
}
