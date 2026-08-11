import {
  Number,
  object,
  record,
  String,
} from "../../../../../packages/common/src/Type.ts";

const Model = object({ count: Number }, record(String, Number));

const parse = (value: unknown): string | number => {
  const result = Model.fromUnknown(value);

  return result.ok
    ? (result.value.score ?? -1)
    : Model.formatError(result.error);
};

export default (): ReadonlyArray<string | number | boolean> => {
  const result = Model.fromUnknown({ count: 0, score: 42 });

  return [
    parse(null),
    parse({ count: 0, score: "x" }),
    result.ok ? (result.value.score ?? -1) : -1,
    result.ok && Model.is(result.value),
  ];
};
