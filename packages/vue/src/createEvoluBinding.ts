import type {
  AppOwnerEvolu,
  createEvolu,
  DeviceEvolu,
  EmptyEvoluSchema,
  EvoluApp,
  EvoluSchema,
  Queries,
  Query,
  QueryRows,
  Row,
} from "@evolu/common/local-first";
import type { Ref } from "vue";
import { useEvoluApp, type EvoluAppProvider } from "./EvoluAppProvider.ts";
import type { EvoluProvider } from "./EvoluProvider.ts";
import type { provideEvolu } from "./provideEvolu.ts";
import { useDeviceEvolu } from "./useDeviceEvolu.ts";
import { useEvolu } from "./useEvolu.ts";
import {
  useDeviceQueries,
  useQueries,
  type QueriesToQueryRowsRef,
  type UseQueriesOptions,
} from "./useQueries.ts";
import { useDeviceQuery, useQuery, type UseQueryOptions } from "./useQuery.ts";

/**
 * The composables {@link createEvoluBinding} returns, typed with the app's
 * schema `S` and its device schema `D`.
 */
export interface VueBinding<
  S extends EvoluSchema,
  D extends EvoluSchema = EmptyEvoluSchema,
> {
  /** {@link useEvolu}, the instance of the AppOwner the tab has open. */
  readonly useEvolu: () => AppOwnerEvolu<S>;
  /** {@link useEvoluApp}, the app. */
  readonly useEvoluApp: () => EvoluApp<S, D>;
  /** {@link useDeviceEvolu}, the instance of the device database. */
  readonly useDeviceEvolu: () => DeviceEvolu<D>;
  /** {@link useQuery}, for a query of the app's tables. */
  readonly useQuery: <R extends Row>(
    query: Query<S, R>,
    options?: UseQueryOptions,
  ) => Readonly<Ref<QueryRows<R>>>;
  /** {@link useQueries}, for queries of the app's tables. */
  readonly useQueries: <Q extends Queries<S>, OQ extends Queries<S>>(
    queries: [...Q],
    options?: UseQueriesOptions<OQ>,
  ) => [...QueriesToQueryRowsRef<Q>, ...QueriesToQueryRowsRef<OQ>];
  /** {@link useDeviceQuery}, for a query of the app's device tables. */
  readonly useDeviceQuery: <R extends Row>(
    query: Query<D, R>,
    options?: UseQueryOptions,
  ) => Readonly<Ref<QueryRows<R>>>;
  /** {@link useDeviceQueries}, for queries of the app's device tables. */
  readonly useDeviceQueries: <Q extends Queries<D>, OQ extends Queries<D>>(
    queries: [...Q],
    options?: UseQueriesOptions<OQ>,
  ) => [...QueriesToQueryRowsRef<Q>, ...QueriesToQueryRowsRef<OQ>];
}

/**
 * Returns {@link useEvolu}, {@link useEvoluApp}, {@link useDeviceEvolu}, and the
 * query composables typed with the app's schema and its device schema, for an
 * app that {@link EvoluAppProvider} provides. {@link useQuery} and
 * {@link useQueries} then take only queries of the app's tables, and
 * {@link useDeviceQuery} and {@link useDeviceQueries} only queries of its device
 * tables. It only types them. Its `useEvolu` and the composables of the app's
 * tables also read an instance of {@link createEvolu} that {@link provideEvolu}
 * or {@link EvoluProvider} provides.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertType,
 *   createQueryBuilder,
 *   id,
 *   NonEmptyTrimmedString100,
 *   testEvoluSchema,
 *   type AppOwnerEvolu,
 *   type DeviceEvolu,
 *   type EvoluApp,
 *   type QueryRows,
 *   type TestEvoluSchema,
 * } from "@evolu/common";
 * import { createEvoluBinding, type VueBinding } from "@evolu/vue";
 * import type { Ref } from "vue";
 *
 * const DeviceSchema = {
 *   setting: { id: id("Setting"), name: NonEmptyTrimmedString100 },
 * };
 * const allTodos = createQueryBuilder(testEvoluSchema)((db) =>
 *   db.selectFrom("todo").selectAll(),
 * );
 * const allSettings = createQueryBuilder(DeviceSchema)((db) =>
 *   db.selectFrom("setting").selectAll(),
 * );
 *
 * // Call them in component setup under EvoluAppProvider.
 * const binding = createEvoluBinding<
 *   TestEvoluSchema,
 *   typeof DeviceSchema
 * >();
 * assertType<
 *   typeof binding,
 *   VueBinding<TestEvoluSchema, typeof DeviceSchema>
 * >();
 * const {
 *   useEvolu,
 *   useEvoluApp,
 *   useDeviceEvolu,
 *   useQuery,
 *   useQueries,
 *   useDeviceQuery,
 *   useDeviceQueries,
 * } = binding;
 *
 * const useTodos = () => useQuery(allTodos);
 * const useSettings = () => useDeviceQuery(allSettings);
 * const useBoth = () => {
 *   const [todos] = useQueries([allTodos]);
 *   const [settings] = useDeviceQueries([allSettings]);
 *   return [todos, settings] as const;
 * };
 * // @ts-expect-error A query of the app's tables isn't one of its device tables.
 * const useTodosOfDevice = () => useDeviceQuery(allTodos);
 *
 * type TodoRows = QueryRows<typeof allTodos.Row>;
 * type SettingRows = QueryRows<typeof allSettings.Row>;
 * assertType<
 *   [
 *     ReturnType<typeof useEvolu>,
 *     ReturnType<typeof useEvoluApp>,
 *     ReturnType<typeof useDeviceEvolu>,
 *     ReturnType<typeof useTodos>,
 *     ReturnType<typeof useSettings>,
 *     ReturnType<typeof useBoth>,
 *   ],
 *   [
 *     AppOwnerEvolu<TestEvoluSchema>,
 *     EvoluApp<TestEvoluSchema, typeof DeviceSchema>,
 *     DeviceEvolu<typeof DeviceSchema>,
 *     Readonly<Ref<TodoRows>>,
 *     Readonly<Ref<SettingRows>>,
 *     readonly [Readonly<Ref<TodoRows>>, Readonly<Ref<SettingRows>>],
 *   ]
 * >();
 * void useTodosOfDevice;
 * ```
 */
export const createEvoluBinding = <
  S extends EvoluSchema,
  D extends EvoluSchema = EmptyEvoluSchema,
>(): VueBinding<S, D> => ({
  useEvolu: useEvolu as () => AppOwnerEvolu<S>,
  useEvoluApp: useEvoluApp as () => EvoluApp<S, D>,
  useDeviceEvolu: useDeviceEvolu as () => DeviceEvolu<D>,
  useQuery,
  useQueries,
  useDeviceQuery,
  useDeviceQueries,
});
