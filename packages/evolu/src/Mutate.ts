import { Context, Effect, Layer, ReadonlyArray } from "effect";
import * as Kysely from "kysely";
import { NanoId } from "./Crypto.js";
import { CommonColumns, Schema } from "./Db.js";
import { DbWorker, MutateItem } from "./DbWorker.js";
import { LoadingPromises } from "./LoadingPromises.js";
import { CastableForMutate, Id, cast } from "./Model.js";
import { OnCompleteId, OnCompletes } from "./OnCompletes.js";
import { SubscribedQueries } from "./SubscribedQueries.js";
import { Time } from "./Timestamp.js";
import { NullableExceptOfId } from "./Utils.js";

export type Mutate<S extends Schema = Schema> = <
  U extends SchemaForMutate<S>,
  T extends keyof U,
>(
  table: T,
  values: Kysely.Simplify<Partial<CastableForMutate<U[T]>>>,
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
      if (isInsert) id = Effect.runSync(nanoid.nanoid) as never;

      let onCompleteId = null;
      if (onComplete) {
        onCompleteId = Effect.runSync(nanoid.nanoid) as OnCompleteId;
        onCompletes.set(onCompleteId, onComplete);
      }

      queue.push({
        table: table as string,
        id: id as Id,
        values: values as MutateItem["values"],
        isInsert,
        now: cast(new Date(Effect.runSync(time.now))),
        onCompleteId,
      });

      if (queue.length === 1)
        queueMicrotask(() => {
          const queries = Array.from(subscribedQueries.keys());
          loadingPromises.releasePromises(queries);

          if (ReadonlyArray.isNonEmptyReadonlyArray(queue))
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
