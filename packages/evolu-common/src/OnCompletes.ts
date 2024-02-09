import * as Brand from "effect/Brand";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ReadonlyArray from "effect/ReadonlyArray";
import { NanoId } from "./Crypto.js";

export interface OnCompletes {
  readonly add: (onComplete: OnComplete) => Effect.Effect<OnCompleteId>;

  readonly complete: (
    onCompleteIds: readonly OnCompleteId[],
  ) => Effect.Effect<void>;
}

export type OnComplete = () => void;

export type OnCompleteId = string & Brand.Brand<"OnCompleteId">;

export const OnCompletes = Context.GenericTag<OnCompletes>(
  "@services/OnCompletes",
);

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

      complete: (onCompleteIds) =>
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
