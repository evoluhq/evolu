import { Age, assertType, type Brand } from "@evolu/common";

// Every constraint a Type checks shows in its type, here as brands.
assertType<
  Age,
  number &
    Brand<"NonNaN"> &
    Brand<"Finite"> &
    Brand<"Int"> &
    Brand<"NonNegative"> &
    Brand<"LessThan200"> &
    Brand<"Age">
>();
