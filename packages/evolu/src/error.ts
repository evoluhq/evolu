import { ioRef } from "fp-ts";
import { IO } from "fp-ts/IO";
import { EvoluError, Unsubscribe } from "./types.js";

const listeners = new Set<IO<void>>();
const lastErrorRef = new ioRef.IORef<EvoluError | null>(null);

export const subscribeError = (listener: IO<void>): Unsubscribe => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const dispatchError =
  (error: EvoluError["error"]): IO<void> =>
  () => {
    lastErrorRef.write({ type: "EvoluError", error })();
    listeners.forEach((listener) => listener());
  };

export const getError: IO<EvoluError | null> = () => lastErrorRef.read();
