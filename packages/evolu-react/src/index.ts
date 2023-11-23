import { EvoluCommonReactLive, makeCreate } from "@evolu/common-react";
import { EvoluCommonWebLive } from "@evolu/common-web";
import { Layer } from "effect";

export * from "@evolu/common/public";

export const create = EvoluCommonReactLive.pipe(
  Layer.use(EvoluCommonWebLive),
  makeCreate,
);
