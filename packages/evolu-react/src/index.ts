import { EvoluFactory, FlushSync } from "@evolu/common";
import { EvoluFactoryWeb } from "@evolu/common-web";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { flushSync } from "react-dom";

export { parseMnemonic } from "@evolu/common-web";
export * from "@evolu/common/public";

const EvoluFactoryWebReact = EvoluFactoryWeb.pipe(
  Layer.provide(Layer.succeed(FlushSync, flushSync)),
);

// JSDoc doesn't support destructured parameters, so we must copy-paste
// createEvolu docs from `evolu-common/src/Evolu.ts`.
// https://github.com/microsoft/TypeScript/issues/11859
export const { createEvolu } = EvoluFactory.pipe(
  Effect.provide(EvoluFactoryWebReact),
  Effect.runSync,
);

export * from "@evolu/common-react";
