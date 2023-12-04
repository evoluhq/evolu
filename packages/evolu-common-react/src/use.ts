/// <reference types="react/experimental" />
import ReactExports from "react";

/**
 * A React 19 `use` polyfill.
 *
 * See https://react.dev/reference/react/use. See
 * https://github.com/acdlite/rfcs/blob/first-class-promises/text/0000-first-class-support-for-promises.md
 */
export const use =
  ReactExports.use ||
  (<T>(
    promise: Promise<T> & {
      status?: "pending" | "fulfilled" | "rejected";
      value?: T;
      reason?: unknown;
    },
  ): T => {
    if (promise.status === "pending") {
      throw promise;
    } else if (promise.status === "fulfilled") {
      return promise.value as T;
    } else if (promise.status === "rejected") {
      throw promise.reason;
    } else {
      promise.status = "pending";
      promise.then(
        (v) => {
          promise.status = "fulfilled";
          promise.value = v;
        },
        (e) => {
          promise.status = "rejected";
          promise.reason = e;
        },
      );
      throw promise;
    }
  });
