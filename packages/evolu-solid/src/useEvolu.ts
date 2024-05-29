import { pipe } from "effect/Function";
import * as O from "effect/Option";
import { Evolu } from "@evolu/common";
import { useContext } from "solid-js";
import { EvoluContext } from "./EvoluContext.js";
/**
 * Hook returning an instance of {@link Evolu}.
 *
 * Please don't use it without the generic parameter.
 *
 * @example
 *   const Database = database({
 *     todo: TodoTable,
 *   });
 *   type Database = S.Schema.Type<typeof Database>;
 *
 *   const { create, update } = useEvolu<Database>();
 *
 *   // Or make an alias:
 *   // const useEvolu = Evolu.useEvolu<Database>;
 */
export const useEvolu = () =>
  pipe(
    useContext(EvoluContext),
    O.fromNullable,
    O.getOrThrowWith(
      () =>
        new Error(
          "could not find Evolu context value; please ensure the component is wrapped in a <EvoluProvider>",
        ),
    ),
  );
