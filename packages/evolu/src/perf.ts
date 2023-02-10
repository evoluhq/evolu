import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { TaskEither } from "fp-ts/TaskEither";

export const logTaskEitherDuration =
  (label: string) =>
  <E, A>(te: TaskEither<E, A>): TaskEither<E, A> =>
  () => {
    // eslint-disable-next-line no-console
    console.time(label);
    return te().then((a) => {
      // eslint-disable-next-line no-console
      console.timeEnd(label);
      return a;
    });
  };

export const logReaderTaskEitherDuration =
  (label: string) =>
  <R, E, A>(rte: ReaderTaskEither<R, E, A>): ReaderTaskEither<R, E, A> =>
  (r) =>
  () => {
    // eslint-disable-next-line no-console
    console.time(label);
    return rte(r)().then((a) => {
      // eslint-disable-next-line no-console
      console.timeEnd(label);
      return a;
    });
  };
