import { Component, OnDestroy, signal } from "@angular/core";
import { registerSW } from "virtual:pwa-register";

@Component({
  selector: "app-pwa-badge",
  template: `
    @if (updateAvailable() || offlineReady()) {
      <div
        class="fixed right-4 bottom-4 z-10 max-w-xs border border-gray-300 bg-white p-4 text-sm shadow"
        role="alert"
      >
        <div class="mb-3 text-gray-800">
          @if (offlineReady()) {
            <span>App ready to work offline</span>
          } @else {
            <span>
              New content available, click on reload button to update.
              @if (error()) {
                <br /><small class="text-red-600">{{ error() }}</small>
              }
            </span>
          }
        </div>
        <div class="flex flex-wrap gap-2">
          @if (updateAvailable()) {
            <button
              type="button"
              class="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
              (click)="handleApplyUpdate()"
            >
              Reload
            </button>
          }
          <button
            type="button"
            class="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
            (click)="handleDismissUpdate()"
          >
            Close
          </button>
        </div>
      </div>
    }
  `,
})
export class PwaBadgeComponent implements OnDestroy {
  private updateSW?: (reloadPage?: boolean) => Promise<void>;
  private swUpdateTimer?: ReturnType<typeof setInterval>;

  readonly updateAvailable = signal(false);
  readonly offlineReady = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.initializePWA();
  }

  ngOnDestroy(): void {
    if (this.swUpdateTimer) {
      clearInterval(this.swUpdateTimer);
      this.swUpdateTimer = undefined;
    }
  }

  private setupPeriodicUpdateCheck(
    period: number,
    swUrl: string,
    r: ServiceWorkerRegistration,
  ): void {
    this.swUpdateTimer = setInterval(async () => {
      if ("onLine" in navigator && !navigator.onLine) return;

      const resp = await fetch(swUrl, {
        cache: "no-store",
        headers: {
          cache: "no-store",
          "cache-control": "no-cache",
        },
      });

      if (resp?.status === 200) await r.update();
    }, period);
  }

  private initializePWA(): void {
    // check for updates every hour
    const period = 60 * 60 * 1000;

    this.updateSW = registerSW({
      onNeedRefresh: () => {
        this.updateAvailable.set(true);
      },
      onOfflineReady: () => {
        this.offlineReady.set(true);
      },
      onRegisteredSW: (
        swUrl: string,
        r: ServiceWorkerRegistration | undefined,
      ) => {
        if (period <= 0 || !r) return;

        if (r?.active?.state === "activated") {
          this.setupPeriodicUpdateCheck(period, swUrl, r);
        } else if (r?.installing) {
          r.installing.addEventListener("statechange", (e) => {
            const sw = e.target as ServiceWorker;
            if (sw.state === "activated") {
              this.setupPeriodicUpdateCheck(period, swUrl, r);
            }
          });
        }
      },
    });
  }

  async handleApplyUpdate(): Promise<void> {
    if (!this.updateSW || !this.updateAvailable()) {
      console.log("No updateSW function available!");
      return;
    }

    try {
      await this.updateSW(true);
    } catch (err) {
      this.error.set("Failed to apply update");
      throw err;
    } finally {
      this.updateAvailable.set(false);
    }
  }

  handleDismissUpdate(): void {
    this.updateAvailable.set(false);
    this.offlineReady.set(false);
    this.error.set(null);
  }
}
