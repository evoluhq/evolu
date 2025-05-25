/** Polyfills `Promise.withResolvers`. */
export const polyfillHermes = (): void => {
  if (typeof Promise.withResolvers === "undefined") {
    // @ts-expect-error This is OK.
    Promise.withResolvers = function () {
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
};
