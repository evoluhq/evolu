import { Context, Effect, Layer, ReadonlyArray } from "effect";
import * as Kysely from "kysely";
import { CommonColumns, Schema } from "./Db.js";
import { DbWorker, MutateItem } from "./DbWorker.js";
import { LoadingPromises } from "./LoadingPromises.js";
import { Id, SqliteBoolean, SqliteDate, cast } from "./Model.js";
import { OnCompleteId, OnCompletes } from "./OnCompletes.js";
import { SubscribedQueries } from "./SubscribedQueries.js";
import { NullableExceptOfId } from "./Utils.js";
import { NanoId } from "./Crypto.js";
import { runSync } from "./run.js";
import { Time } from "./Time.js";

export type Mutate<S extends Schema = Schema> = <
  U extends SchemaForMutate<S>,
  T extends keyof U,
>(
  table: T,
  values: Kysely.Simplify<Partial<AllowAutoCasting<U[T]>>>,
  onComplete?: () => void
) => {
  readonly id: U[T]["id"];
};

export const Mutate = Context.Tag<Mutate>("evolu/Mutate");

type SchemaForMutate<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & Pick<CommonColumns, "isDeleted">
  >;
};

export type AllowAutoCasting<T> = {
  readonly [K in keyof T]: T[K] extends SqliteBoolean
    ? boolean | SqliteBoolean
    : T[K] extends null | SqliteBoolean
    ? null | boolean | SqliteBoolean
    : T[K] extends SqliteDate
    ? Date | SqliteDate
    : T[K] extends null | SqliteDate
    ? null | Date | SqliteDate
    : T[K];
};

export const MutateLive = Layer.effect(
  Mutate,
  Effect.gen(function* (_) {
    const nanoid = yield* _(NanoId);
    const onCompletes = yield* _(OnCompletes);
    const time = yield* _(Time);
    const subscribedQueries = yield* _(SubscribedQueries);
    const loadingPromises = yield* _(LoadingPromises);
    const dbWorker = yield* _(DbWorker);

    const queue: Array<MutateItem> = [];

    return Mutate.of((table, { id, ...values }, onComplete) => {
      const isInsert = id == null;
      if (isInsert) id = runSync(nanoid.nanoid) as never;

      let onCompleteId = null;
      if (onComplete) {
        onCompleteId = runSync(nanoid.nanoid) as OnCompleteId;
        onCompletes.set(onCompleteId, onComplete);
      }

      queue.push({
        table: table as string,
        id: id as Id,
        values: values as MutateItem["values"],
        isInsert,
        now: cast(new Date(runSync(time.now))),
        onCompleteId,
      });

      if (queue.length === 1)
        queueMicrotask(() => {
          if (!ReadonlyArray.isNonEmptyReadonlyArray(queue)) return;

          const queries = Array.from(subscribedQueries.keys());
          loadingPromises.releasePromises(queries);

          dbWorker.postMessage({
            _tag: "mutate",
            items: queue,
            queries,
          });

          queue.length = 0;
        });

      return { id: id as never };
    });
  })
);
