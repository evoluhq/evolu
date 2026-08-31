import {
  array,
  Boolean,
  NonEmptyTrimmedString100,
  NonEmptyTrimmedString1000,
  PositiveInt,
  record,
  typed,
  undefinedOr,
} from "../../../../packages/common/src/Type.ts";

const Todo = typed("Todo", {
  title: NonEmptyTrimmedString100,
  description: NonEmptyTrimmedString1000,
  completed: undefinedOr(Boolean),
  labels: array(NonEmptyTrimmedString100),
  estimatesByUser: record(NonEmptyTrimmedString100, PositiveInt),
});

const TodoList = array(Todo);

const parse = (value: unknown): string => {
  const result = TodoList.fromUnknown(value);

  return result.ok
    ? (result.value[0]?.type ?? "Empty")
    : TodoList.formatError(result.error);
};

export default (): ReadonlyArray<string> => [
  parse(null),
  parse([
    {
      type: "Todo",
      title: "",
      description: "x",
      completed: false,
      labels: [],
      estimatesByUser: {},
    },
  ]),
  parse([
    {
      type: "Todo",
      title: "x",
      description: "x",
      completed: false,
      labels: ["x"],
      estimatesByUser: null,
    },
  ]),
  parse([
    {
      type: "Todo",
      title: "x",
      description: "x",
      completed: false,
      labels: ["x"],
      estimatesByUser: { alice: 3 },
    },
  ]),
];
