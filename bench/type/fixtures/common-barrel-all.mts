import { String } from "../../../packages/common/src/index.ts";
import "./chains/root.mts"; // oxlint-disable-line import/no-unassigned-import -- Includes the complete compiler-performance dependency chain.

export type Output = typeof String.Output;
