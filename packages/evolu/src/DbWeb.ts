import { Layer } from "effect";
import { Db } from "./Db.js";

export const DbWeb = Layer.succeed(
  Db,
  Db.of({
    exec: (_arg) => {
      throw "";
    },
    changes: () => {
      throw "";
    },
  })
);
