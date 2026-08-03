import {
  array,
  lazy,
  object,
  String,
  type ArrayError,
  type LazyType,
  type ObjectError,
  type TypeOfError,
} from "../../../../../packages/common/src/Type2.ts";

interface StringTree {
  readonly value: string;
  readonly children: ReadonlyArray<StringTree>;
}

interface StringTreeError extends ObjectError<{
  readonly value: TypeOfError<"String">;
  readonly children: ArrayError<StringTreeError>;
}> {}

const StringTree: LazyType<
  StringTree,
  StringTree,
  never,
  StringTreeError,
  StringTreeError
> = /*#__PURE__*/ lazy(() =>
  object({ value: String, children: array(StringTree) }),
);

export default (): ReadonlyArray<string | boolean> => {
  const valid = StringTree.fromUnknown({
    value: "root",
    children: [{ value: "leaf", children: [] }],
  });
  const invalid = StringTree.fromUnknown({
    value: "root",
    children: [{ value: 42, children: [] }],
  });

  return [
    valid.ok
      ? (valid.value.children.at(0)?.value ?? "Missing leaf.")
      : StringTree.formatError(valid.error),
    invalid.ok ? "Unexpected success." : StringTree.formatError(invalid.error),
    valid.ok && StringTree.is(valid.value),
  ];
};
