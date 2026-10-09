import {
  assertOk,
  assertType,
  NonEmptyTrimmedString100,
  NonEmptyTrimmedString1000,
  object,
  trim,
  type MaxLengthError,
  type MinLengthError,
  type Result,
  type TrimmedString,
} from "@evolu/common";

const Todo = object({ title: NonEmptyTrimmedString100 });

// Todo.from checks the contract between a value's producer and the domain:
// a title already validated as NonEmptyTrimmedString100 passes as is.
const title = NonEmptyTrimmedString100.orThrow("Buy milk");
assertOk(Todo.from({ title }), { title });

// If a form starts accepting longer titles, the mismatch is a compile error,
// not a failed save in production.
const longerTitle = NonEmptyTrimmedString1000.orThrow("Buy milk");
// @ts-expect-error MaxLength1000 does not guarantee MaxLength100.
Todo.from({ title: longerTitle });

// A form that only trims connects through the parent chain, and only the
// constraints it doesn't guarantee are checked.
const trimmed: TrimmedString = trim("  Buy milk  ");
const validated = Todo.props.title.from.parent.parent(trimmed);
assertType<
  typeof validated,
  Result<NonEmptyTrimmedString100, MaxLengthError<100> | MinLengthError<1>>
>();
