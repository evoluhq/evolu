import { object } from "./api.mts";
import { NO4 } from "./nested-object-04.mts";

const NO5 = /*#__PURE__*/ object({ value: NO4 });

const NO6 = /*#__PURE__*/ object({ value: NO5 });

const NO7 = /*#__PURE__*/ object({ value: NO6 });

export const NO8 = /*#__PURE__*/ object({ value: NO7 });
