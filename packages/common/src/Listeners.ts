/**
 * Simple publish-subscribe mechanism for event broadcasting.
 *
 * @module
 */

/** A callback invoked on notification. */
export type Listener<T = void> = (value: T) => void;

/** Unsubscribe function to remove a listener. */
export type Unsubscribe = () => void;

/**
 * A simple publish-subscribe mechanism for broadcasting notifications.
 *
 * Use Listeners when you need to notify multiple listeners about events. The
 * generic parameter allows typed payloads.
 *
 * ### Example
 *
 * ```ts
 * // Without payload (default)
 * const listeners = createListeners();
 * listeners.subscribe(() => console.log("notified"));
 * listeners.notify();
 *
 * // With typed payload
 * const listeners = createListeners<{ id: string }>();
 * listeners.subscribe((event) => console.log(event.id));
 * listeners.notify({ id: "123" });
 * ```
 */
export interface Listeners<T = void> extends Disposable {
  /** Registers a listener and returns an unsubscribe function. */
  readonly subscribe: (listener: Listener<T>) => Unsubscribe;

  /** Notifies all registered listeners. */
  readonly notify: (value: T) => void;
}

/** Creates a {@link Listeners} instance for managing subscriptions. */
export const createListeners = <T = void>(): Listeners<T> => {
  let listeners: Set<Listener<T>> | null = null;

  return {
    subscribe: (listener) => {
      listeners ??= new Set();
      listeners.add(listener);
      return () => listeners?.delete(listener);
    },

    notify: (value) => {
      if (listeners) for (const listener of listeners) listener(value);
    },

    [Symbol.dispose]: () => {
      listeners?.clear();
    },
  };
};
