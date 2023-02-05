import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { TaskEither } from "fp-ts/TaskEither";

export const logTaskEitherDuration =
  <E, A>(te: TaskEither<E, A>): TaskEither<E, A> =>
  () => {
    const s = performance.now();
    return te().then((a) => {
      // eslint-disable-next-line no-console
      console.log(performance.now() - s);
      return a;
    });
  };

export const logReaderTaskEitherDuration =
  <R, E, A>(te: ReaderTaskEither<R, E, A>): ReaderTaskEither<R, E, A> =>
  (r) =>
  () => {
    const s = performance.now();
    return te(r)().then((a) => {
      // eslint-disable-next-line no-console
      console.log(performance.now() - s);
      return a;
    });
  };

export const isServer = typeof window === "undefined" || "Deno" in window;
