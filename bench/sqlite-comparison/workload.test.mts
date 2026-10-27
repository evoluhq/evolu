import { assertEqual, assertTrue } from "@evolu/common";
import { describe, it } from "node:test";
import {
  connectionPragmas,
  createDriverPointSelectKeys,
  driverPointSelectCount,
  driverRowCount,
  driverValue,
  splitStatements,
} from "./workload.mts";

describe("splitStatements", () => {
  it("splits at semicolons and keeps each statement's semicolon", () => {
    assertEqual(
      splitStatements("BEGIN;\nINSERT INTO t VALUES(1);\n  COMMIT;\n"),
      ["BEGIN;", "INSERT INTO t VALUES(1);", "COMMIT;"],
    );
  });

  it("ignores semicolons in string literals, with doubled quotes", () => {
    assertEqual(splitStatements("SELECT 'a;b', 'it''s; ok';SELECT 2;"), [
      "SELECT 'a;b', 'it''s; ok';",
      "SELECT 2;",
    ]);
  });

  it("ignores semicolons in quoted identifiers", () => {
    assertEqual(
      splitStatements('SELECT "a;b", `c;d`, [e;f] FROM t;SELECT """;""";'),
      ['SELECT "a;b", `c;d`, [e;f] FROM t;', 'SELECT """;""";'],
    );
  });

  it("ignores semicolons in comments and drops fragments of only comments", () => {
    assertEqual(
      splitStatements(
        "-- a; comment\nSELECT 1; /* b; */ ; -- trailing;\n/* only */;",
      ),
      ["-- a; comment\nSELECT 1;"],
    );
  });

  it("keeps the text after the last semicolon when it has a statement", () => {
    assertEqual(splitStatements("SELECT 1; SELECT 2"), [
      "SELECT 1;",
      "SELECT 2",
    ]);
  });

  it("returns nothing for whitespace, semicolons and an unterminated comment", () => {
    assertEqual(splitStatements(" ;\n; /* open"), []);
  });

  it("ends an unterminated string at the end of the SQL", () => {
    assertEqual(splitStatements("SELECT 'a;"), ["SELECT 'a;"]);
  });
});

describe("connectionPragmas", () => {
  it("sets secure_delete off only on a plain connection", () => {
    assertTrue(connectionPragmas(false).includes("PRAGMA secure_delete = OFF"));
    assertEqual(
      connectionPragmas(true),
      connectionPragmas(false).filter(
        (pragma) => !pragma.includes("secure_delete"),
      ),
    );
  });

  it("sets the page size first", () => {
    assertEqual(connectionPragmas(false)[0], "PRAGMA page_size = 4096");
  });
});

describe("the driver workload", () => {
  it("reads keys of rows it inserted, the same ones every time", () => {
    const keys = createDriverPointSelectKeys();
    assertEqual(keys.length, driverPointSelectCount);
    assertTrue(
      keys.every(
        (key) => Number.isInteger(key) && key >= 1 && key <= driverRowCount,
      ),
    );
    assertEqual(createDriverPointSelectKeys(), keys);
    // Spread over the table rather than a few rows.
    assertTrue(new Set(keys).size > driverPointSelectCount / 2);
  });

  it("gives each key its own value", () => {
    const values = new Set(
      Array.from({ length: driverRowCount }, (_, index) =>
        driverValue(index + 1),
      ),
    );
    assertEqual(values.size, driverRowCount);
  });
});
