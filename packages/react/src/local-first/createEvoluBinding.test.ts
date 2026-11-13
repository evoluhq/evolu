import {
  assertType,
  createQueryBuilder,
  id,
  String,
  type AppOwnerEvolu,
  type DeviceEvolu,
  type EvoluApp,
} from "@evolu/common";
import { test } from "node:test";
import { createEvoluBinding } from "./createEvoluBinding.ts";

const TestSchema = {
  test: {
    id: id("Test"),
  },
};

const DeviceSchema = {
  _settings: { id: id("Settings"), theme: String },
};

// @ts-expect-error createEvoluBinding accepts the schema as a type argument.
void (() => createEvoluBinding(TestSchema));

test("creates a binding from an EvoluSchema type", () => {
  const { useEvolu } = createEvoluBinding<typeof TestSchema>();

  assertType<ReturnType<typeof useEvolu>, AppOwnerEvolu<typeof TestSchema>>();
});

test("types the app hooks with the app's and the device's schemas", () => {
  const { useEvoluApp, useDeviceEvolu } = createEvoluBinding<
    typeof TestSchema,
    typeof DeviceSchema
  >();

  assertType<
    ReturnType<typeof useEvoluApp>,
    EvoluApp<typeof TestSchema, typeof DeviceSchema>
  >();
  assertType<
    ReturnType<typeof useDeviceEvolu>,
    DeviceEvolu<typeof DeviceSchema>
  >();
});

test("types useDeviceQuery and useDeviceQueries with the device schema, which has no tables by default", () => {
  const { useDeviceQuery, useDeviceQueries } =
    createEvoluBinding<typeof TestSchema>();
  const allTests = createQueryBuilder(TestSchema)((db) =>
    db.selectFrom("test").selectAll(),
  );
  // @ts-expect-error A device schema without tables has no table to query, such as the app's own.
  void (() => useDeviceQuery(allTests));
  // @ts-expect-error useDeviceQueries takes only queries of the device schema, never one of the app's tables.
  void (() => useDeviceQueries([allTests]));
});
