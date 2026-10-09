import { Age, assertType, type Brand } from "@evolu/common";

// Every constraint a Type checks is a brand, so its type says what was checked.
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
