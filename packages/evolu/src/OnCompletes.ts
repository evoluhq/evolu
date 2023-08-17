import { Brand, Context, Layer } from "effect";

export type OnCompletes = Map<OnCompleteId, OnComplete>;

export const OnCompletes = Context.Tag<OnCompletes>("evolu/OnCompletes");

export type OnCompleteId = string &
  Brand.Brand<"Id"> &
  Brand.Brand<"OnComplete">;

export type OnComplete = () => void;

export const OnCompletesLive = Layer.succeed(
  OnCompletes,
  OnCompletes.of(new Map()),
);
