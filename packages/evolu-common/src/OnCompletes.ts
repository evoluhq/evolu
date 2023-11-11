import { Brand, Context, Effect, Layer, Option, ReadonlyArray } from "effect";
import { NanoId } from "./Crypto.js";

export interface OnCompletes {
  readonly add: (
    onComplete: OnComplete,
  ) => Effect.Effect<never, never, OnCompleteId>;

  readonly flush: (
    onCompleteIds: readonly OnCompleteId[],
  ) => Effect.Effect<never, never, void>;
}

export type OnComplete = () => void;
// TODO: Refactor to Brand.Brand<"OnCompleteId">;
export type OnCompleteId = string &
  Brand.Brand<"Id"> &
  Brand.Brand<"OnComplete">;

export const OnCompletes = Context.Tag<OnCompletes>();

export const OnCompletesLive = Layer.effect(
  OnCompletes,
  Effect.gen(function* (_) {
    const nanoid = yield* _(NanoId);
    const map = new Map<OnCompleteId, OnComplete>();

    return OnCompletes.of({
      add: (onComplete) =>
        nanoid.nanoid.pipe(
          Effect.map((nanoid) => {
            const id = nanoid as OnCompleteId;
            map.set(id, onComplete);
            return id;
          }),
        ),

      flush: (onCompleteIds) =>
        Effect.sync(() => {
          ReadonlyArray.filterMap(onCompleteIds, (id) => {
            const onComplete = map.get(id);
            map.delete(id);
            return Option.fromNullable(onComplete);
          }).forEach((onComplete) => onComplete());
        }),
    });
  }),
);
