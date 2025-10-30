import { Injectable, OnDestroy, inject, signal } from "@angular/core";
import { InferRow, Mnemonic, Query, Row } from "@evolu/common";
import { EVOLU } from "./app.config";
import { formatTypeError } from "./error-formatter";
import { TodoId } from "./schema";

@Injectable({ providedIn: "root" })
export class AppService implements OnDestroy {
  private readonly evolu = inject(EVOLU);
  private readonly unsubscribes: Array<() => void> = [];

  private readonly todosQuery = this.evolu.createQuery((db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted"])
      .where("isDeleted", "is not", 1)
      .where("title", "is not", null)
      .orderBy("createdAt"),
  );

  readonly todos = signal<InferRow<typeof this.todosQuery>[]>([]);

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
    });

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
      isCompleted: Number(isCompleted),
    });
  }

  deleteTodo(id: string) {
    this.evolu.update("todo", {
      id: id as TodoId,
      isDeleted: Number(true),
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
    this.loadAndSubscribeEvoluQuery(this.todosQuery, (rows) =>
      this.todos.set(rows),
    )
      .catch((error) => {
        console.error("Failed to load data:", error);
      })
      .finally(() => this.isLoading.set(false));
  }

  private initializeAppOwner(): void {
    void this.evolu.appOwner.then((owner) => {
      this.mnemonic.set(owner.mnemonic ?? null);
    });
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
