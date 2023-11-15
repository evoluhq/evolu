import * as S from "@effect/schema/Schema";
import * as Evolu from "@evolu/react";
import { FC } from "react";

const TodoId = Evolu.id("Todo");
type TodoId = S.Schema.To<typeof TodoId>;

const TodoCategoryId = Evolu.id("TodoCategory");
type TodoCategoryId = S.Schema.To<typeof TodoCategoryId>;

const NonEmptyString50 = Evolu.String.pipe(
  S.minLength(1),
  S.maxLength(50),
  S.brand("NonEmptyString50"),
);
type NonEmptyString50 = S.Schema.To<typeof NonEmptyString50>;

const TodoTable = S.struct({
  id: TodoId,
  title: Evolu.NonEmptyString1000,
  isCompleted: Evolu.SqliteBoolean,
  categoryId: S.nullable(TodoCategoryId),
});
type TodoTable = S.Schema.To<typeof TodoTable>;

const SomeJson = S.struct({ foo: S.string, bar: S.boolean });
type SomeJson = S.Schema.To<typeof SomeJson>;

const TodoCategoryTable = S.struct({
  id: TodoCategoryId,
  name: NonEmptyString50,
  json: SomeJson,
});
type TodoCategoryTable = S.Schema.To<typeof TodoCategoryTable>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Database = S.struct({
  todo: TodoTable,
  todoCategory: TodoCategoryTable,
});
type Database = S.Schema.To<typeof Database>;

// const evolu =
Evolu.create(Database, { reloadUrl: "" });

// evolu.evolu.create("todo", {title})

// export const todos = evolu.evolu.createQuery((db) =>
//   db.selectFrom("todo").selectAll(),
// );
// console.log(evolu);

// const {
//   evolu,
//   // EvoluProvider,
//   // useQuery,
//   // useCreate,
//   // useUpdate,
//   // useEvoluError,
//   // useOwner,
// } = Evolu.create(Database);

// evolu.

// nebo fakt vytvorit evolu, a pak React?

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// const evolu = Evolu.createEvolu(Database);

// const { EvoluProvider, useQuery, useCreate, useUpdate } =
//   Evolu.createReact(evolu);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// const todos = evolu.createQuery((db) =>
//   db
//     .selectFrom("todo")
//     .selectAll()
//     // TODO: Tohle kdyby existovalo, hmm, exists
//     // ale bacha, musi se to skladat potom pres or!
//     // use case: pridam novou prop, starou prestanu pouzivat
//     // chci jen ty, ktere existuji jedna nebo druha
//     // a ted ta otazka, jde to sloucit? tusim to slo pres ten JSON
//     // to je jedina cesta, ze bych vytvoril novou prop
//     // titleOrTitleBla, a dal ji union a tag, to by slo
//     // je to nested object subselect per neco, jo
//     // ok, tak budu mit DSL pro use cases, nice!
//     // .$call(foo('title'))
//     // aspon jeden bych udelat mohl
//     .$call((a) =>
//       a
//         .where("title", "is not", null)
//         .$narrowType<{ title: Evolu.NonEmptyString1000 }>(),
//     ),
// );

// const { useQuery, useMutation, useEvoluError, useOwner, useOwnerActions } =
//   Evolu.create({
//     Database,
//     reloadUrl: "/examples/nextjs",
//     ...(process.env.NODE_ENV === "development" && {
//       syncUrl: "http://localhost:4000",
//     }),
//   });

// const prompt = <From extends string, To>(
//   schema: Schema.Schema<From, To>,
//   message: string,
//   onSuccess: (value: To) => void,
// ): void => {
//   const value = window.prompt(message);
//   if (value == null) return; // on cancel
//   const a = Schema.parseEither(schema)(value);
//   if (a._tag === "Left") {
//     alert(TreeFormatter.formatErrors(a.left.errors));
//     return;
//   }
//   onSuccess(a.right);
// };

// const Button: FC<{
//   title: string;
//   onClick: () => void;
// }> = ({ title, onClick }) => {
//   return (
//     <button
//       className="m-1 rounded-md border border-current px-1 text-sm active:opacity-80"
//       onClick={onClick}
//     >
//       {title}
//     </button>
//   );
// };

// interface TodoCategoryForSelect {
//   readonly id: TodoCategoryTable["id"];
//   readonly name: TodoCategoryTable["name"] | null;
// }

// const TodoCategorySelect: FC<{
//   categories: ReadonlyArray<TodoCategoryForSelect>;
//   selected: TodoCategoryId | null;
//   onSelect: (_value: TodoCategoryId | null) => void;
// }> = ({ categories, selected, onSelect }) => {
//   const nothingSelected = "";
//   const value =
//     selected && categories.find((row) => row.id === selected)
//       ? selected
//       : nothingSelected;

//   return (
//     <select
//       value={value}
//       onChange={({
//         target: { value },
//       }: ChangeEvent<HTMLSelectElement>): void => {
//         onSelect(value === nothingSelected ? null : (value as TodoCategoryId));
//       }}
//     >
//       <option value={nothingSelected}>-- no category --</option>
//       {categories.map(({ id, name }) => (
//         <option key={id} value={id}>
//           {name}
//         </option>
//       ))}
//     </select>
//   );
// };

// const TodoItem = memo<{
//   row: Pick<TodoTable, "id" | "title" | "isCompleted" | "categoryId"> & {
//     categories: ReadonlyArray<TodoCategoryForSelect>;
//   };
// }>(function TodoItem({
//   row: { id, title, isCompleted, categoryId, categories },
// }) {
//   const { update } = useMutation();

//   return (
//     <li>
//       <span
//         className="text-sm font-bold"
//         style={{ textDecoration: isCompleted ? "line-through" : "none" }}
//       >
//         {title}
//       </span>
//       <Button
//         title={isCompleted ? "Completed" : "Complete"}
//         onClick={(): void => {
//           update("todo", { id, isCompleted: !isCompleted });
//         }}
//       />
//       <Button
//         title="Rename"
//         onClick={(): void => {
//           prompt(Evolu.NonEmptyString1000, "New Name", (title) => {
//             update("todo", { id, title });
//           });
//         }}
//       />
//       <Button
//         title="Delete"
//         onClick={(): void => {
//           update("todo", { id, isDeleted: true });
//         }}
//       />
//       <TodoCategorySelect
//         categories={categories}
//         selected={categoryId}
//         onSelect={(categoryId): void => {
//           update("todo", { id, categoryId });
//         }}
//       />
//     </li>
//   );
// });

// const Todos: FC = () => {
//   const { create } = useMutation();

//   const { rows } = useQuery((db) =>
//     db
//       .selectFrom("todo")
//       .select(["id", "title", "isCompleted", "categoryId"])
//       .where("isDeleted", "is not", Evolu.cast(true))
//       .where("title", "is not", null)
//       .where("isCompleted", "is not", null)
//       .orderBy("createdAt")
//       // https://kysely.dev/docs/recipes/relations
//       .select((eb) => [
//         Evolu.jsonArrayFrom(
//           eb
//             .selectFrom("todoCategory")
//             .select(["todoCategory.id", "todoCategory.name"])
//             .where("isDeleted", "is not", Evolu.cast(true))
//             .orderBy("createdAt"),
//         ).as("categories"),
//       ])
//       .select((eb) => [
//         Evolu.jsonArrayFrom(
//           eb
//             .selectFrom("todoCategory")
//             .select(["todoCategory.id", "todoCategory.name"])
//             .where("isDeleted", "is not", Evolu.cast(true))
//             .orderBy("createdAt"),
//         ).as("test"),
//       ])
//       .$narrowType<{ title: Evolu.NonEmptyString1000 }>()
//       .$narrowType<{ isCompleted: Evolu.SqliteBoolean }>(),
//   );

//   // ({ title, isCompleted, ...rest }) =>
//   //     title != null && isCompleted != null && { title, isCompleted, ...rest }

//   // rows[0].

//   return (
//     <>
//       <h2 className="mt-6 text-xl font-semibold">Todos</h2>
//       <ul className="py-2">
//         {rows.map((row) => (
//           <TodoItem key={row.id} row={row} />
//         ))}
//       </ul>
//       <Button
//         title="Add Todo"
//         onClick={(): void => {
//           prompt(
//             Evolu.NonEmptyString1000,
//             "What needs to be done?",
//             (title) => {
//               create("todo", { title, isCompleted: false });
//             },
//           );
//         }}
//       />
//     </>
//   );
// };

// const TodoCategories: FC = () => {
//   const { create, update } = useMutation();
//   const { rows } = useQuery(
//     (db) =>
//       db
//         .selectFrom("todoCategory")
//         .select(["id", "name", "json"])
//         .where("isDeleted", "is not", Evolu.cast(true))
//         .orderBy("createdAt"),
//     ({ name, ...rest }) => name && { name, ...rest },
//   );

//   // Evolu automatically parses JSONs into typed objects.
//   // if (rows[0]) console.log(rows[0].json?.foo);

//   return (
//     <>
//       <h2 className="mt-6 text-xl font-semibold">Categories</h2>
//       <ul className="py-2">
//         {rows.map(({ id, name }) => (
//           <li key={id}>
//             <span className="text-sm font-bold">{name}</span>
//             <Button
//               title="Rename"
//               onClick={(): void => {
//                 prompt(NonEmptyString50, "Category Name", (name) => {
//                   update("todoCategory", { id, name });
//                 });
//               }}
//             />
//             <Button
//               title="Delete"
//               onClick={(): void => {
//                 update("todoCategory", { id, isDeleted: true });
//               }}
//             />
//           </li>
//         ))}
//       </ul>
//       <Button
//         title="Add Category"
//         onClick={(): void => {
//           prompt(NonEmptyString50, "Category Name", (name) => {
//             create("todoCategory", {
//               name,
//               json: { foo: "a", bar: false },
//             });
//           });
//         }}
//       />
//     </>
//   );
// };

// const OwnerActions: FC = () => {
//   const [isShown, setIsShown] = useState(false);
//   const owner = useOwner();
//   const ownerActions = useOwnerActions();

//   return (
//     <div className="mt-6">
//       <p>
//         Open this page on a different device and use your mnemonic to restore
//         your data.
//       </p>
//       <Button
//         title={`${!isShown ? "Show" : "Hide"} Mnemonic`}
//         onClick={(): void => setIsShown((value) => !value)}
//       />
//       <Button
//         title="Restore Owner"
//         onClick={(): void => {
//           prompt(Evolu.NonEmptyString1000, "Your Mnemonic", (mnemonic) => {
//             void ownerActions.restore(mnemonic).then((either) => {
//               if (either._tag === "Left")
//                 alert(JSON.stringify(either.left, null, 2));
//             });
//           });
//         }}
//       />
//       <Button
//         title="Reset Owner"
//         onClick={(): void => {
//           if (confirm("Are you sure? It will delete all your local data."))
//             ownerActions.reset();
//         }}
//       />
//       {isShown && owner != null && (
//         <div>
//           <textarea
//             value={owner.mnemonic}
//             readOnly
//             rows={2}
//             style={{ width: 320 }}
//           />
//         </div>
//       )}
//     </div>
//   );
// };

// const NotificationBar: FC = () => {
//   const evoluError = useEvoluError();
//   const [shown, setShown] = useState(false);

//   useEffect(() => {
//     if (evoluError) setShown(true);
//   }, [evoluError]);

//   if (!evoluError || !shown) return null;

//   return (
//     <div>
//       <p>{`Error: ${JSON.stringify(evoluError)}`}</p>
//       <Button title="Close" onClick={(): void => setShown(false)} />
//     </div>
//   );
// };

export const NextJsExample: FC = () => {
  // const [todosShown, setTodosShown] = useState(true);

  return (
    <>
      {/* <OwnerActions />
      <nav className="my-4">
        <Button
          title="Simulate suspense-enabled router transition"
          onClick={(): void => {
            // https://react.dev/reference/react/useTransition#building-a-suspense-enabled-router
            startTransition(() => {
              setTodosShown(!todosShown);
            });
          }}
        />
        <p>
          Using suspense-enabled router transition, you will not see any loader
          or jumping content.
        </p>
      </nav>
      <Suspense>{todosShown ? <Todos /> : <TodoCategories />}</Suspense>
      <NotificationBar /> */}
    </>
  );
};
