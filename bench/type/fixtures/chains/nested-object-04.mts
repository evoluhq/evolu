import { object } from "./api.mts";
import { NO2 } from "./nested-object-02.mts";

const NO3 = /*#__PURE__*/ object({ value: NO2 });

export const NO4 = /*#__PURE__*/ object({ value: NO3 });
