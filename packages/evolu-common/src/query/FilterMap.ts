import { Option, ReadonlyArray } from "effect";
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

// Evolu caches filterMap results to preserve rows identity (===) for React.
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

export const filterMapRows =
  <From extends Row, To extends Row>(filterMap: FilterMap<From, To>) =>
  (rows: ReadonlyArray<From>): ReadonlyArray<To> =>
    ReadonlyArray.filterMap(rows, (row) => {
      const filterMapRow = filterMap(row);
      if (filterMapRow === false) return Option.none();
      return Option.fromNullable(filterMapRow);
    });
