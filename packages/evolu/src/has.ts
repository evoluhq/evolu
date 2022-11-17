/**
 * Filter items with NonNullable props with type refinement.
 * It helps filter yet-to-be-synced data.
 *
 * Example: array.filter(has(["title"]))
 */
export const has =
  <T extends object, K extends keyof T>(props: readonly K[]) =>
  (obj: T): obj is T & { readonly [k in K]-?: NonNullable<T[K]> } =>
    !props.some((o) => obj[o] == null);
