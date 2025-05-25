/**
 * Helper function to ensure exhaustive matching in a switch statement. Throws
 * an error if an unhandled case is encountered.
 *
 * Remember, it's useful only when we don't return anything from the switch
 * statement. Otherwise, a return type of a function is enough.
 *
 * ### Example
 *
 * ```ts
 * type Color = "red" | "green" | "blue";
 *
 * function handleColor(color: Color): void {
 *   switch (color) {
 *     case "red":
 *       console.log("Handling red");
 *       break;
 *     case "green":
 *       console.log("Handling green");
 *       break;
 *     case "blue":
 *       console.log("Handling blue");
 *       break;
 *     default:
 *       exhaustiveCheck(color); // Ensures all cases are handled
 *   }
 * }
 * ```
 */
export const exhaustiveCheck = (value: never): never => {
  throw new Error(`exhaustiveCheck unhandled case: ${JSON.stringify(value)}`);
};

export const identity = <A>(a: A): A => a;

/**
 * A function that delays computation and returns a value of type T.
 *
 * Useful for:
 *
 * - Lazy evaluation
 * - Returning constant values
 * - Providing default or placeholder behaviors
 *
 * ### Example
 *
 * ```ts
 * const getRandomNumber: LazyValue<number> = () => Math.random();
 * const randomValue = getRandomNumber();
 * ```
 */
export type LazyValue<T> = () => T;

export const constVoid: LazyValue<void> = () => undefined;
export const constUndefined: LazyValue<undefined> = () => undefined;
export const constNull: LazyValue<null> = () => null;
export const constTrue: LazyValue<true> = () => true;
export const constFalse: LazyValue<false> = () => false;
