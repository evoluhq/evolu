import { Row } from "../Sqlite.js";

/**
 * Filter and map array items in one step with the correct return type and
 * without unreliable TypeScript type guards.
 *
 * ### Examples
 *
 * ```
 * createQuery(
 *   (db) => db.selectFrom("todo").selectAll(),
 *   // Filter and map nothing.
 *   (row) => row,
 * );
 *
 * createQuery(
 *   (db) => db.selectFrom("todo").selectAll(),
 *   // Filter items with title != null.
 *   // Note the title type isn't nullable anymore.
 *   ({ title, ...rest }) => title != null && { title, ...rest },
 * );
 * ```
 */
export type FilterMap<From extends Row, To extends Row> = (
  row: From,
) => To | null | false;

export const cacheFilterMap = <From extends Row, To extends Row>(
  filterMap: FilterMap<From, To>,
): FilterMap<From, To> => {
  const cache = new WeakMap<From, To | null | false>();
  return (row: From) => {
    let cachedRow = cache.get(row);
    if (cachedRow === undefined) {
      cachedRow = filterMap(row);
      cache.set(row, cachedRow);
    }
    return cachedRow;
  };
};

// const filterMapRows = <R extends Row>(rows: ReadonlyArray<Row>) =>
// a neco, co dostane rows, a vraci rows, a pouzije ten filterMap
// return ReadonlyArray.filterMap(rows, (row) => {
//   const cachedRow = cacheFilterMap(filterMap)(row as QueryRow);
//   if (cachedRow === false) return Option.none();
//   return Option.fromNullable(cachedRow);
// });
