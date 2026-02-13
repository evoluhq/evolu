import { Name } from "../src/Type.js";
import { AppName } from "../src/local-first/Evolu.js";

export const testName = /*#__PURE__*/ Name.orThrow("Name");
export const testAppName = /*#__PURE__*/ AppName.orThrow("AppName");
