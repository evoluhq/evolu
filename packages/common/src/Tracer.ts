import { Ref } from "./Ref.js";
import type { Runner } from "./Task.js";

/**
 * Minimal tracer interface for observability.
 *
 * Tracer provides unified observability for both sync and async code. Use it
 * directly for sync operations, or let {@link Runner} use it automatically for
 * async tasks.
 *
 * ### Example
 *
 * ```ts
 * // Sync code — use tracer directly
 * const result = deps.tracer?.span("parseData", () => parseData(input));
 *
 * // Async code — Runner traces automatically
 * await using run = createRunner(deps);
 * const result = await run(fetchUser(id)); // Traced if tracer provided
 * ```
 *
 * TODO: Complete implementation with OpenTelemetry adapter.
 *
 * @experimental
 */
export interface Tracer {
  /**
   * Wraps a sync function in a traced span.
   *
   * Records start time, end time, and success/failure status.
   */
  readonly span: <T>(name: string, fn: () => T) => T;

  /** Records an event/fact (e.g., "user.purchased", "sync.completed"). */
  readonly event: (name: string, data?: unknown) => void;
}

export interface TracerDep {
  readonly tracer: Tracer;
}

/** Configuration for tracing. */
export interface TracerConfig {
  /** When `true`, enables trace data collection. Can be toggled at runtime. */
  readonly tracing?: Ref<boolean>;
}

export interface TracerConfigDep {
  readonly tracerConfig: TracerConfig;
}
