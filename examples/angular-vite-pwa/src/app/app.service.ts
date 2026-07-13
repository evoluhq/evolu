import { Injectable, OnDestroy, inject, signal } from "@angular/core";
import {
  booleanToSqliteBoolean,
  createQueryBuilder,
  InferRow,
  Mnemonic,
  NonEmptyString100,
  sqliteTrue,
} from "@evolu/common";
import { EVOLU } from "./app.config";
import { formatTypeError } from "./error-formatter";
import { Schema, TodoId } from "./schema";

const createQuery = createQueryBuilder(Schema);

const todosQuery = createQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("title", "is not", null)
    .orderBy("createdAt"),
);

@Injectable({ providedIn: "root" })
export class AppService implements OnDestroy {
  private readonly evolu = inject(EVOLU);
  private readonly unsubscribes: Array<() => void> = [];

  readonly todos = signal<ReadonlyArray<InferRow<typeof todosQuery>>>([]);

  readonly mnemonic = signal<string | null>(null);

  readonly isLoading = signal(true);

  constructor() {
    this.initializeData();
    this.initializeAppOwner();
  }

  ngOnDestroy(): void {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  /** Todos */

  addTodo(title: string) {
    const result = NonEmptyString100.from(title.trim());
    if (!result.ok) {
      alert(formatTypeError(result.error));
      return;
    }

    this.evolu.insert("todo", {
      title: result.value,
    });
  }

  renameTodo(id: string, title: string) {
    const result = NonEmptyString100.from(title.trim());
    if (!result.ok) {
      alert(formatTypeError(result.error));
      return;
    }

    this.evolu.update("todo", {
      id: id as TodoId,
      title: result.value,
    });
  }

  toggleTodo(id: string, isCompleted: boolean) {
    this.evolu.update("todo", {
      id: id as TodoId,
      isCompleted: booleanToSqliteBoolean(isCompleted),
    });
  }

  deleteTodo(id: string) {
    this.evolu.update("todo", {
      id: id as TodoId,
      isDeleted: sqliteTrue,
    });
  }

  /** App owner */

  restoreFromMnemonic(mnemonic: string): void {
    const trimmedMnemonic = mnemonic.trim();
    if (!trimmedMnemonic) {
      return;
    }

    const mnemonicResult = Mnemonic.from(trimmedMnemonic);
    if (!mnemonicResult.ok) {
      alert(formatTypeError(mnemonicResult.error));
      return;
    }

    // TODO: Implement secure AppOwner persistence before restoring.
  }

  resetAppOwner(): void {
    // TODO: Implement secure AppOwner persistence before resetting.
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
    const updateTodos = () => {
      this.todos.set(this.evolu.getQueryRows(todosQuery));
    };

    this.unsubscribes.push(this.evolu.subscribeQuery(todosQuery)(updateTodos));

    this.evolu
      .loadQuery(todosQuery)
      .then((rows) => {
        this.todos.set(rows);
      })
      .catch((error) => {
        console.error("Failed to load data:", error);
      })
      .finally(() => this.isLoading.set(false));
  }

  private initializeAppOwner(): void {
    this.mnemonic.set(this.evolu.appOwner.mnemonic);
  }
}
