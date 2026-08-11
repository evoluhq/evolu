import {
  Age,
  array,
  Boolean,
  DateIso,
  discriminatedUnion,
  FiniteNumber,
  Id,
  Int64FromInt64String,
  json,
  NonEmptyTrimmedString100,
  NonEmptyTrimmedString1000,
  nullOr,
  object,
  PositiveInt,
  record,
  tuple,
  typed,
  undefinedOr,
  union,
} from "../../../../../packages/common/src/Type.ts";

const Theme = union("System", "Light", "Dark");

const Preferences = object({
  theme: NonEmptyTrimmedString100,
  compact: Boolean,
  shortcuts: array(tuple(NonEmptyTrimmedString100, NonEmptyTrimmedString100)),
});

const [PreferencesJson, preferencesToJson, preferencesJsonToPreferences] = json(
  Preferences,
  "PreferencesJson",
);

const User = typed("User", {
  id: Id,
  name: NonEmptyTrimmedString100,
  theme: Theme,
  age: nullOr(Age),
  createdAt: DateIso,
  preferences: PreferencesJson,
});

const Todo = typed("Todo", {
  id: Id,
  ownerId: Id,
  title: NonEmptyTrimmedString100,
  description: NonEmptyTrimmedString1000,
  estimate: undefinedOr(PositiveInt),
  completed: Boolean,
});

const Comment = typed("Comment", {
  id: Id,
  todoId: Id,
  authorId: Id,
  body: NonEmptyTrimmedString1000,
  createdAt: DateIso,
});

const AppEvent = discriminatedUnion(User, Todo, Comment);

const AppPayload = object({
  events: array(AppEvent),
  cursor: Int64FromInt64String,
  positionsByUser: record(Id, tuple(FiniteNumber, FiniteNumber)),
});

const id = "AAAAAAAAAAAAAAAAAAAAAA";
const preferences = Preferences.orThrow({
  theme: "System",
  compact: true,
  shortcuts: [],
});
const preferencesJson = preferencesToJson(preferences);

const parse = (value: unknown): string => {
  const result = AppPayload.fromUnknown(value);

  return result.ok
    ? (result.value.events[0]?.type ?? "Empty")
    : AppPayload.formatError(result.error);
};

const validPayload: typeof AppPayload.Input = {
  events: [
    {
      type: "User",
      id,
      name: "Ada",
      theme: "System",
      age: 42,
      createdAt: "2026-01-01T00:00:00.000Z",
      preferences: preferencesJson,
    },
    {
      type: "Todo",
      id,
      ownerId: id,
      title: "Ship Type",
      description: "Keep the API lawful.",
      estimate: 3,
      completed: false,
    },
  ],
  cursor: "1",
  positionsByUser: { [id]: [45, 16] },
};

export default (): ReadonlyArray<string> => [
  parse(null),
  parse({
    ...validPayload,
    events: [{ ...validPayload.events[1], title: "" }],
  }),
  parse(validPayload),
  preferencesJson,
  preferencesJsonToPreferences(preferencesJson).theme,
  AppPayload.to(AppPayload.orThrow(validPayload)).cursor,
];
