import { brand } from "./api.mts";
import { S4 } from "./semantic-04.mts";

const S5 = brand("S5", S4);

const S6 = brand("S6", S5);

const S7 = brand("S7", S6);

export const S8 = /*#__PURE__*/ brand("S8", S7);
