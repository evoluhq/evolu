import { IO } from "fp-ts/IO";
import { config } from "./config.js";
import { LogTarget } from "./types.js";

export const log: (target: LogTarget) => <A>(a: A) => IO<void> =
  (target) => (a) => () => {
    if (
      typeof config.log === "boolean"
        ? config.log
        : [config.log].flat().includes(target)
    )
      // eslint-disable-next-line no-console
      console.log(target, a);
  };

// export const logTaskEitherDuration =
//   <E, A>(te: TaskEither<E, A>): TaskEither<E, A> =>
//   () => {
//     const s = performance.now();
//     return te().then((a) => {
//       // eslint-disable-next-line no-console
//       console.log(performance.now() - s);
//       return a;
//     });
//   };

// export const logReaderTaskEitherDuration =
//   <R, E, A>(te: ReaderTaskEither<R, E, A>): ReaderTaskEither<R, E, A> =>
//   (r) =>
//   () => {
//     const s = performance.now();
//     return te(r)().then((a) => {
//       // eslint-disable-next-line no-console
//       console.log(performance.now() - s);
//       return a;
//     });
//   };
