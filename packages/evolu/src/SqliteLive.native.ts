import { Effect, Function, Layer } from "effect";
import { Row, Sqlite } from "./Sqlite.js";
import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabase("evolu1.db");

// db.execAsync

// https://github.com/expo/expo/pull/23109
// await db.transactionAsync(async (tx) => {
//   const result = await tx.executeSqlAsync("SELECT COUNT(*) FROM USERS", []);
//   if ("error" in result) {
//     result.error;
//   } else {
//     // result.rowsAffected
//   }
//   //   console.log("Count:", result.rows[0]["COUNT(*)"]);
// });

const exec: Sqlite["exec"] = (arg) => {
  const isSqlString = typeof arg === "string";
  const sqlStatement = isSqlString ? arg : arg.sql;
  return Effect.sync(() => {
    console.log(sqlStatement);
    return { rows: [], changes: 0 };
  });
};
// Effect.promise(() => sqlite).pipe(
//   Effect.map((sqlite) => {
//     //   const isSqlString = typeof arg === "string";
//     //   // console.log("input", arg);
//     //   const rows = sqlite.exec(isSqlString ? arg : arg.sql, {
//     //     returnValue: "resultRows",
//     //     rowMode: "object",
//     //     ...(!isSqlString && { bind: arg.parameters }),
//     //   });
//     //   // console.log("output", rows);
//     //   return rows;
//     throw "";
//   }),
// );

export const SqliteLive = Layer.succeed(Sqlite, { exec });
